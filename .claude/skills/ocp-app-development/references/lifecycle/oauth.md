# Lifecycle — OAuth

OAuth is a two-step flow handled by `onAuthorizationRequest` and `onAuthorizationGrant`. Both hooks must be implemented in every app — if the app does not support OAuth, return a danger toast from each.

## Flow

1. Customer clicks an `oauth_button` in the settings form
2. Platform calls `onAuthorizationRequest` — validate pre-OAuth fields, then redirect to the external provider
3. Customer authorizes at the provider and is redirected back to the OCP OAuth grant endpoint
4. Platform calls `onAuthorizationGrant` — exchange the code for a token, persist it, redirect customer back to settings

---

## onAuthorizationRequest

```typescript
import {
  functions,
  Lifecycle,
  LifecycleSettingsResult,
  storage,
  SubmittedFormData,
} from '@zaiusinc/app-sdk';

public async onAuthorizationRequest(
  section: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const result = new LifecycleSettingsResult();

  if (!formData.instance_url) {
    return result.addError('instance_url', 'Instance URL is required before authorizing');
  }

  // Persist the whole form section so onAuthorizationGrant can read it back
  await storage.settings.put(section, formData);

  // functions.getAuthorizationGrantUrl() returns the OCP OAuth callback URL to pass
  // as redirect_uri to the external provider — synchronous, no await needed
  const redirectUri = functions.getAuthorizationGrantUrl();
  const authUrl = ExternalAuth.buildAuthUrl(formData.instance_url as string, redirectUri);
  return result.redirect(authUrl);
}
```

Clicking an `oauth_button` bypasses `onSettingsForm` — this method is the only opportunity to persist the current form data before the redirect. Always call `storage.settings.put(section, formData)` here if `onAuthorizationGrant` needs to read any of those values back.

Use `result.redirect(url)` to send the customer to the external provider. Use `result.addError` or `result.addToast` to surface validation failures without redirecting.

**Pre-flight state storage:** `storage.settings.put(section, formData)` is the simplest approach — it persists the whole form section so `onAuthorizationGrant` can read it back without a separate secrets lookup. Use `storage.secrets` instead when the pre-flight state contains sensitive values that must not appear in the settings form UI.

---

## onAuthorizationGrant

Called when the customer returns from the external provider. The inbound request contains the authorization code and any state parameters in `request.params`.

```typescript
import {
  AuthorizationGrantResult,
  functions,
  Lifecycle,
  Request,
  storage,
} from '@zaiusinc/app-sdk';

public async onAuthorizationGrant(request: Request): Promise<AuthorizationGrantResult> {
  const result = new AuthorizationGrantResult('credentials'); // redirect section on completion

  if (!request.params.code) {
    return result.addToast('danger', 'Authorization was denied or cancelled');
  }

  try {
    const { instance_url } = await storage.settings.get<{ instance_url: string }>('credentials');
    const redirectUri = functions.getAuthorizationGrantUrl();
    const token = await ExternalAuth.exchangeCode(instance_url, request.params.code as string, redirectUri);

    await storage.secrets.put('token', {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
    await storage.settings.patch('credentials', { authorized: true });

    // Register webhook now that credentials are available
    const { webhook } = await functions.getEndpoints();
    const webhookId = await ExternalApi.registerWebhook(token.access_token, webhook);
    await storage.kvStore.put('webhook', { id: webhookId });

    return result.addToast('success', 'Successfully authorized');
  } catch (e) {
    return result.addToast('danger', 'Authorization failed — please try again');
  }
}
```

### Request type

| Property      | Type             | Description                                                                       |
|---------------|------------------|-----------------------------------------------------------------------------------|
| `params`      | `QueryParams`    | Query string parameters — contains `code`, `state`, and any other provider params |
| `headers`     | `Headers`        | HTTP request headers                                                              |
| `body`        | `Uint8Array`     | Raw request body                                                                  |
| `bodyJSON`    | `any`            | Parsed JSON body (cached)                                                         |
| `contentType` | `string \| null` | MIME type from the Content-Type header                                            |

### AuthorizationGrantResult

`new AuthorizationGrantResult(redirectSection)` — the `redirectSection` is where the customer lands after grant completes.

| Method                       | Description                                                                                 |
|------------------------------|---------------------------------------------------------------------------------------------|
| `.addError(field, message)`  | Field error scoped to the redirect section                                                  |
| `.addToast(intent, message)` | Toast shown in the redirect section. Intent: `'info'`, `'success'`, `'warning'`, `'danger'` |

---

## Apps that do not support OAuth

Both hooks must still be implemented:

```typescript
public async onAuthorizationRequest(
  _section: string,
  _formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  return new LifecycleSettingsResult().addToast('danger', 'OAuth is not supported by this app');
}

public async onAuthorizationGrant(_request: Request): Promise<AuthorizationGrantResult> {
  return new AuthorizationGrantResult('').addToast('danger', 'OAuth is not supported by this app');
}
```

---

## Common mistakes

| Mistake                                                                                                                             | Fix                                                                                                                                                                                                                                 |
|-------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Storing OAuth tokens in `storage.settings`                                                                                          | Use `storage.secrets` — tokens must not appear in the settings form UI                                                                                                                                                              |
| `new AuthorizationGrantResult('')` with an empty section in a real OAuth app                                                        | Pass the section name the customer should land on — an empty string leaves them on a blank page after a successful grant. (For non-OAuth stubs that return a danger toast, the empty string is harmless since no redirect happens.) |
| Not checking for `request.params.code` in `onAuthorizationGrant`                                                                    | The customer may have denied access at the provider — always check before exchanging                                                                                                                                                |
| Registering webhooks in `onAuthorizationRequest`                                                                                    | Credentials are not available yet — register in `onAuthorizationGrant` after the token exchange                                                                                                                                     |
| Hardcoding the redirect URI instead of using `functions.getAuthorizationGrantUrl()`                                                 | The grant URL is installation-specific — always use `functions.getAuthorizationGrantUrl()` for the `redirect_uri` in both the authorization request and the code exchange                                                           |
| Putting field validation or `storage.settings.put` in `onSettingsForm` for a section whose only submit control is an `oauth_button` | `onSettingsForm` is never called for that section — move all field validation and persistence to `onAuthorizationRequest`                                                                                                           |
