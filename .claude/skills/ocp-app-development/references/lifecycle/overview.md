# Lifecycle — Overview

All lifecycle hooks are implemented in `src/lifecycle/Lifecycle.ts` as methods of a class that extends `Lifecycle` from `@zaiusinc/app-sdk`.

## When each hook is called

| Hook                     | When                                                                 |
|--------------------------|----------------------------------------------------------------------|
| `onInstall`              | Once when a customer installs the app                                |
| `onSettingsForm`         | Every time a settings form section is submitted                      |
| `onAuthorizationRequest` | When a customer clicks an `oauth_button` in the settings form        |
| `onAuthorizationGrant`   | When the customer returns from the external OAuth provider           |
| `onUpgrade`              | At the start of the version upgrade                                  |
| `onFinalizeUpgrade`      | After the version upgrade, once new function endpoints are available |
| `onAfterUpgrade`         | After the version upgrade completes successfully                     |
| `canUninstall`           | When uninstall is initiated, before `onUninstall` runs               |
| `onUninstall`            | When the customer uninstalls the app                                 |

## Lifecycle flow

```
Install
  └── onInstall

Configure
  ├── onSettingsForm
  ├── onAuthorizationRequest
  └── onAuthorizationGrant

Upgrade
  ├── onUpgrade
  ├── onFinalizeUpgrade
  └── onAfterUpgrade

Uninstall
  ├── canUninstall
  └── onUninstall
```

