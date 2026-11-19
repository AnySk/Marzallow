#!/bin/sh
# `panel` (the default) runs the panel, `node` runs this server as a node for
# another panel; anything else is run as a command.
case "$1" in
  panel | "")
    alembic upgrade head
    exec python main.py ;;
  node)
    shift
    exec python -m node "$@" ;;
  *)
    exec "$@" ;;
esac
