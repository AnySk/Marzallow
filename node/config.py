"""The Xray config a node runs: the panel's config plus the node's own API inbound."""
import json
from typing import List, Sequence

API_INBOUND_TAG = "API_INBOUND"
API_OUTBOUND_TAG = "API"


class NodeXRayConfig(dict):
    """Turns the config the panel sent into the one the node runs.

    The panel's own API inbound is replaced by one that listens on the node's
    API port with the node's certificate (the panel pins that certificate) and
    only accepts connections from localhost and the connected panel.
    """

    def __init__(self, config: str, *, peer_ip: str, api_host: str, api_port: int,
                 ssl_cert_file: str, ssl_key_file: str, inbounds: Sequence[str] = ()):
        super().__init__(json.loads(config))
        if not isinstance(self.get("inbounds", []), list):
            raise ValueError("inbounds must be a list")

        old_api_tag = (self.get("api") or {}).get("tag")
        self["inbounds"] = [
            inbound for inbound in self.get("inbounds", [])
            if inbound.get("tag") != API_INBOUND_TAG and (not inbounds or inbound.get("tag") in inbounds)
        ]
        rules: List[dict] = (self.get("routing") or {}).get("rules") or []
        if old_api_tag:
            rules = [rule for rule in rules if rule.get("outboundTag") != old_api_tag]

        self["api"] = {"services": ["HandlerService", "StatsService", "LoggerService"], "tag": API_OUTBOUND_TAG}
        self["stats"] = {}
        self["inbounds"].insert(0, {
            "listen": api_host,
            "port": api_port,
            "protocol": "dokodemo-door",
            "settings": {"address": "127.0.0.1"},
            "streamSettings": {
                "security": "tls",
                "tlsSettings": {"certificates": [{"certificateFile": ssl_cert_file, "keyFile": ssl_key_file}]},
            },
            "tag": API_INBOUND_TAG,
        })
        rules.insert(0, {
            "inboundTag": [API_INBOUND_TAG],
            "source": ["127.0.0.1", peer_ip],
            "outboundTag": API_OUTBOUND_TAG,
            "type": "field",
        })
        self.setdefault("routing", {})
        self["routing"]["rules"] = rules

    def to_json(self, **json_kwargs) -> str:
        return json.dumps(self, **json_kwargs)
