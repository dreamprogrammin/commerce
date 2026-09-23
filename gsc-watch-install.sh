#!/bin/zsh
#
# Установка ежедневного наблюдателя за Search Console на эту машину.
#
# ПОЧЕМУ КОПИЯ, А НЕ ЗАПУСК ИЗ РЕПОЗИТОРИЯ. macOS запрещает заданиям
# планировщика ЧИТАТЬ файлы в ~/Desktop — проверено запуском: `ls` проходит, а
# `head` отвечает «Operation not permitted». Репозиторий лежит на Рабочем
# столе, поэтому рабочая копия наблюдателя ставится в
# ~/Library/Application Support/uhti-gsc-watch (туда доступ есть), а
# репозиторий остаётся источником правды: поправили здесь — прогнали установку
# заново.
#
#   ./gsc-watch-install.sh          # поставить или обновить
#   ./gsc-watch-install.sh --off    # снять задание (копия и журнал остаются)
#
# Ключ Search Console копируется рядом с наблюдателем и закрывается правами
# 600: в облако его класть нельзя, а без него наблюдатель не работает.

set -u
cd "$(dirname "$0")" || exit 1

LABEL="kz.uhti.gsc-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DEST="$HOME/Library/Application Support/uhti-gsc-watch"

if [ "${1:-}" = "--off" ]; then
  launchctl unload -w "$PLIST" 2>/dev/null
  rm -f "$PLIST"
  echo "задание снято; копия наблюдателя и журнал остались в:"
  echo "  $DEST"
  exit 0
fi

# Ключ: путь берём из конфига claude-seo, как и сам наблюдатель.
SA_SRC="$(node -e "const c=require('$HOME/.config/claude-seo/google-api.json');process.stdout.write(c.service_account_path||'')" 2>/dev/null)"
if [ -z "$SA_SRC" ] || [ ! -f "$SA_SRC" ]; then
  echo "не нашёл ключ Search Console (service_account_path в ~/.config/claude-seo/google-api.json)" >&2
  exit 1
fi

mkdir -p "$DEST"
cp gsc-watch.mjs "$DEST/gsc-watch.mjs"
cp "$SA_SRC" "$DEST/service-account.json"
chmod 600 "$DEST/service-account.json"

# Конфиг рядом с копией: путь к ключу — локальный, чтобы задание не лезло на
# Рабочий стол вовсе.
node -e "
const fs=require('fs');
const src=JSON.parse(fs.readFileSync('$HOME/.config/claude-seo/google-api.json','utf8'));
src.service_account_path='$DEST/service-account.json';
fs.writeFileSync('$DEST/google-api.json', JSON.stringify(src,null,2));
"

cat > "$DEST/run.sh" <<RUNNER
#!/bin/zsh
# Собран установщиком из репозитория — правьте gsc-watch-install.sh, не это.
set -u
cd "\$(dirname "\$0")" || exit 1
[ -s "\$HOME/.nvm/nvm.sh" ] && . "\$HOME/.nvm/nvm.sh" >/dev/null 2>&1

export GSC_CONFIG="\$(dirname "\$0")/google-api.json"
export GSC_SA_PATH="\$(dirname "\$0")/service-account.json"
export GSC_STATE_DIR="\$(dirname "\$0")"

OUT="\$(node gsc-watch.mjs 2>&1)"
CODE=\$?
{ echo "════ \$(date '+%Y-%m-%d %H:%M') ════"; echo "\$OUT"; echo; } >> "\$(dirname "\$0")/gsc-watch.log"

# Уведомление только на код 1 — «появилось новое». Код 2 (сеть, ключ, отказ
# API) в журнал, но без тревоги: сбой связи находкой не является.
if [ \$CODE -eq 1 ]; then
  SUMMARY="\$(echo "\$OUT" | grep 'ПОЯВИЛОСЬ' | head -3 | sed 's/^ *• //' | tr '\n' ' ')"
  osascript -e "display notification \"\${SUMMARY:-подробности в журнале}\" with title \"Search Console: новое замечание\"" >/dev/null 2>&1
fi

echo "\$OUT"
exit \$CODE
RUNNER
chmod +x "$DEST/run.sh"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$DEST/run.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>10</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$DEST/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$DEST/launchd.log</string>
</dict>
</plist>
PLIST

launchctl unload -w "$PLIST" 2>/dev/null
launchctl load -w "$PLIST" || { echo "не удалось загрузить задание" >&2; exit 1; }

echo "поставлено: ежедневно в 10:30"
echo "  наблюдатель: $DEST/gsc-watch.mjs"
echo "  журнал:      $DEST/gsc-watch.log"
echo "  проверить:   launchctl start $LABEL"
echo "  снять:       ./gsc-watch-install.sh --off"
