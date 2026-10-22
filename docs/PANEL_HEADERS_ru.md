# Заголовки панели в Kabosu

Реализация сверена с [MikanApp](https://github.com/getmikan/MikanApp/blob/974d5c10c4df34db991379f7ae50d75e163b5db4/docs/supported-headers.md), commit `974d5c10c4df34db991379f7ae50d75e163b5db4`.

## Запросы подписки

`User-Agent` — ровно `kabosu://`, включая предварительную проверку ссылки.
Подмены под ClashMeta / ClashForWindows больше нет. Панель должна выдавать
конфигурацию Citrus / Clash Meta этому User-Agent. Клиент дополнительно отправляет
`x-mikan-features: groups`, `x-device-os`, `x-ver-os`, `x-device-model`,
`x-app-version`. `x-hwid` сохраняет существующий переключатель приватности.
Фактическая версия ядра показывается в настройках, а не добавляется к User-Agent.

## Метаданные подписки

| Заголовки | Поведение |
|---|---|
| `Subscription-Userinfo` | Использованный/оставшийся трафик и срок подписки |
| `Profile-Title`, `Subscription-Title`, `X-Subscription-Title`, `Display-Name` | Предложенное имя при импорте, включая `base64:` UTF-8 |
| `Profile-Update-Interval`, `Update-Interval`, `X-Profile-Update-Interval` | Рекомендованный интервал, 1–720 часов; ручное значение пользователя сохраняется |
| `Profile-Web-Page-URL`, `Subscription-Web-Page`, `X-Subscription-Web-Page`, `Profile-Web-Page` | Личный кабинет и покупка трафика, если нет отдельного Cabinet URL |
| `Support-URL`, `Profile-Support-URL`, `Subscription-Support-URL`, `X-Support-URL`, `Support` | Кнопка поддержки |
| `Announce`, `Announcement`, `X-Announcement`, `Profile-Announce` | Объявление, `base64:` и буквальный `\n` |
| `Announce-URL`, `Announcement-URL`, `X-Announce-URL`, `X-Announcement-URL` | Действие в карточке объявления |
| `Share-Links`, `Share_Links`, `X-Share-Links`, `X-Share-Links-Policy` | Запрет копирования URL, редактирования URL и сырого файла этой подписки; имя и автообновление остаются доступны |
| `X-Network-Stack`, `Network-Stack`, `X-NetworkStack`, `X-NetworkStack-enabled` | `system`, `gvisor`, `mixed`, `mips` задают TUN stack только этой подписки; `auto` снимает ограничение |
| `x-hwid-active`, `x-hwid-not-supported`, `x-hwid-max-devices-reached`, `x-hwid-limit` | Состояние панели в диагностике; уведомление на главной при достижении лимита |
| `X-Mikan-Groups` | `base64:` JSON v1: квоты, пакеты, сброс, исчерпание, привязка серверов; карточка подписки, страница оператора, метки и фильтр узлов |

Проверенные расширения и политики принимаются только от HTTPS-подписки.
Редирект HTTPS → HTTP отклоняется. У каждой подписки свои значения; отсутствие
заголовка при следующем успешном обновлении снимает старое ограничение.
При изменении URL очищается кэш метаданных и тела прежнего провайдера.

`X-Bypass-Preset` не применяется: Android-пресеты содержат package IDs приложений,
которым нет достоверного соответствия процессам Windows/macOS/Linux. Трафик в обход
туннеля автоматически не переводится. Для desktop нужны собственные наборы процессов
и отдельное подтверждение пользователя; это не заменено выдуманными списками.

## Оформление и оператор

Стандартный namespace Android поддерживается напрямую:

- `X-Branding-Enabled` включает оформление.
- `X-Brand-Name`, `Tagline`, `Logo-URL`, `Logo-Light-URL`, `Accent-Color` — имя,
  подпись, локально кэшируемые логотипы и seed палитры Material 3.
- `X-Brand-Website-URL`, `Support-URL`, `Telegram-URL`, `Bot-URL`, `Privacy-URL`,
  `Terms-URL`, `Help-URL`, `Status-URL`, `Renew-URL`, `Cabinet-URL` — действия оператора.
- `X-Brand-User-Display-Name`, `X-Brand-Greeting` — контекст пользователя.
- `X-Brand-Show-Operator-Tab` показывает страницу оператора при наличии визуального
  бренда. `X-Brand-Hide-Routing` скрывает пункт правил. Настройки и логи доступны.
- `X-Brand-Hide-Global-Mode` фиксирует Rule mode, в том числе при подключении и через
  backend API. `X-Brand-Lock-Config-Script` запрещает сохранение и preview скрипта,
  а также выполнение ранее сохранённого скрипта. Эти политики работают без включения бренда.
- `X-Brand-Primary-Proxy-Group` / `X-Brand-PrimaryProxyGroup` определяет группу на главной.
- `X-Brand-Proxy-Group-Layout` / `X-Brand-ProxyGroupLayout`: `tabs` — список
  раскрывающихся групп desktop, `dropdown` — переключатель группы. Выбор пользователя
  сохраняется отдельно для профиля и имеет приоритет.

Если явно передан `X-Brand-Desktop-Enabled`, используется прежний desktop namespace
целиком; `false` выключает оформление desktop, даже при общем `X-Branding-Enabled: true`.
Дополнительные desktop-поля Devices-Used/Limit, Hide-Proxy-Mode, Hide-Local-Configs,
Hide-Advanced сохранены. Старые профили и IPC не переименовываются.

Строки очищаются от управляющих символов и ограничиваются по длине, шаблонные
переменные разворачивает панель. Ссылки оператора допускают HTTPS, Telegram и mailto;
логотипы — только публичный HTTPS, PNG/JPEG/WebP до 512 KiB и 1 048 576 пикселей.
DNS-адреса проверяются непосредственно при подключении, редиректы ограничены и
повторно проверяются. Произвольный SVG/HTML не загружается как логотип.
Имя Kabosu, иконка приложения, обновления и системные права не меняются заголовками.
В информации оператора остаётся `Powered by Kabosu · Citrus`.

## Проверки

`subscription_panel_test.go` проверяет разбор, границы HTTPS/лого, сброс политики,
запрет мутаций и исполнение политики после скриптов. Фронтенд дополнен проверками
квот, экранирования текста, заблокированных действий и страницы оператора через SSR.
Эти проверки не запускают GUI, системный прокси, TUN или сервис.
