#!/usr/bin/env bash

case "$1" in
"setup")
	node /checkly/cli/packages/create-cli/index.mjs "${@:2}"
	;;
*)
	/checkly/cli/packages/cli/bin/run "$@"
	;;
esac
