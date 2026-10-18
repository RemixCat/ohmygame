#!/bin/zsh
set -e

cd "${0:A:h:h}"
export PATH="$HOME/.bun/bin:$PATH"
export NO_PROXY="localhost,127.0.0.1,::1${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"

# Reuse the HTTPS proxy already enabled in macOS for downloads and model access.
proxy_settings="$(/usr/sbin/scutil --proxy)"
proxy_enabled="$(printf '%s\n' "$proxy_settings" | awk '$1 == "HTTPSEnable" {print $3}')"
proxy_host="$(printf '%s\n' "$proxy_settings" | awk '$1 == "HTTPSProxy" {print $3}')"
proxy_port="$(printf '%s\n' "$proxy_settings" | awk '$1 == "HTTPSPort" {print $3}')"
if [[ "$proxy_enabled" == "1" && -n "$proxy_host" && -n "$proxy_port" ]]; then
  export HTTPS_PROXY="http://$proxy_host:$proxy_port"
  export HTTP_PROXY="$HTTPS_PROXY"
  export ELECTRON_GET_USE_PROXY=1
fi

if ! command -v bun >/dev/null || ! command -v node >/dev/null; then
  echo "需要先安装 Bun 1.4.2+ 和 Node.js 22.19+。"
  read "?按回车关闭。"
  exit 1
fi

echo "正在启动 OhMyGame，使用过程中请保留此终端窗口。"
echo "退出时在此窗口按 Control+C。"
bun run start:desktop
