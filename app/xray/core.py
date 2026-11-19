import atexit
import re
import subprocess
import threading
from collections import deque
from contextlib import contextmanager

from app import logger
from app.utils.crypto import get_x25519_public_key
from app.xray.config import XRayConfig
from config import DEBUG


class XRayCore:
    def __init__(self,
                 executable_path: str = "/usr/bin/xray",
                 assets_path: str = "/usr/share/xray"):
        self.executable_path = executable_path
        self.assets_path = assets_path

        self.version = self.get_version()
        self.process = None
        self._restart_lock = threading.Lock()

        self._logs_buffer = deque(maxlen=100)
        self._temp_log_buffers = {}
        self._on_start_funcs = []
        self._on_stop_funcs = []
        self._env = {
            "XRAY_LOCATION_ASSET": assets_path
        }

        atexit.register(lambda: self.stop() if self.started else None)

    def get_version(self):
        cmd = [self.executable_path, "version"]
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode('utf-8')
        m = re.match(r'^Xray (\d+\.\d+\.\d+)', output)
        if m:
            return m.groups()[0]

    def get_x25519(self, private_key: str = None):
        """Generate (or derive from `private_key`) an X25519 key pair.

        Derivation is done in Python; only key generation shells out to xray.
        Xray has changed the `xray x25519` output labels several times
        ("Public key:" -> "PublicKey:" -> "Password (PublicKey):"), so the
        output is parsed by label prefix rather than exact text.
        """
        if private_key:
            return {"private_key": private_key, "public_key": get_x25519_public_key(private_key)}

        output = subprocess.check_output([self.executable_path, "x25519"], stderr=subprocess.STDOUT).decode('utf-8')
        values = {}
        for line in output.splitlines():
            if ':' in line:
                label, value = line.split(':', 1)
                values[re.sub(r'[^a-z]', '', label.lower())] = value.strip()
        private = next((v for k, v in values.items() if k.startswith('privatekey')), None)
        if private:
            return {"private_key": private, "public_key": get_x25519_public_key(private)}

    def __capture_process_logs(self, process: subprocess.Popen):
        # The process is passed in (not read from self.process) so a restart
        # can't make this thread read the new process' pipe.
        def capture():
            for output in iter(process.stdout.readline, ''):
                output = output.strip()
                self._logs_buffer.append(output)
                for buf in list(self._temp_log_buffers.values()):
                    buf.append(output)
                if DEBUG:
                    logger.debug(output)

        threading.Thread(target=capture, daemon=True).start()

    @contextmanager
    def get_logs(self):
        buf = deque(self._logs_buffer, maxlen=100)
        buf_id = id(buf)
        try:
            self._temp_log_buffers[buf_id] = buf
            yield buf
        finally:
            del self._temp_log_buffers[buf_id]
            del buf

    @property
    def started(self):
        if not self.process:
            return False

        if self.process.poll() is None:
            return True

        return False

    def start(self, config: XRayConfig):
        if self.started is True:
            raise RuntimeError("Xray is started already")

        # the log capture (used by the dashboard's logs view) needs warnings
        log = config.get('log', {})
        for key in ('loglevel', 'logLevel'):
            if log.get(key) in ('none', 'error'):
                log[key] = 'warning'

        cmd = [
            self.executable_path,
            "run",
            '-config',
            'stdin:'
        ]
        self.process = subprocess.Popen(
            cmd,
            env=self._env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            # Merge stderr into stdout: a separate, never-read stderr pipe fills
            # up and blocks xray once it logs enough errors.
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )
        self.process.stdin.write(config.to_json())
        self.process.stdin.flush()
        self.process.stdin.close()
        logger.warning(f"Xray core {self.version} started")

        self.__capture_process_logs(self.process)

        # execute on start functions
        for func in self._on_start_funcs:
            threading.Thread(target=func).start()

    def stop(self):
        if not self.started:
            return

        process, self.process = self.process, None
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        logger.warning("Xray core stopped")

        # execute on stop functions
        for func in self._on_stop_funcs:
            threading.Thread(target=func).start()

    @property
    def restarting(self) -> bool:
        return self._restart_lock.locked()

    def restart(self, config: XRayConfig):
        if not self._restart_lock.acquire(blocking=False):
            return  # another restart is already in progress
        try:
            logger.warning("Restarting Xray core...")
            self.stop()
            self.start(config)
        finally:
            self._restart_lock.release()

    def on_start(self, func: callable):
        self._on_start_funcs.append(func)
        return func

    def on_stop(self, func: callable):
        self._on_stop_funcs.append(func)
        return func
