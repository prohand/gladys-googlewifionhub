# Security policy

## Supported versions

Only the latest release of the Google Wifi / OnHub integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-googlewifionhub](https://github.com/prohand/gladys-googlewifionhub/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords, IP and MAC addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the Google
Wifi / Nest Wifi / OnHub firmware and the Google APIs this integration talks to (report to
Google).

## What the integration handles

- **The Google refresh token** (cloud channel) is the sensitive piece: whoever holds it can
  manage the Wi-Fi of the Google account (see the connected devices, pause them, restart the
  network). It lives in a Gladys secret field, is never written to a log nor to an error
  message, is kept in memory only, and is only ever sent to Google hosts
  (`www.googleapis.com`, `oauthaccountmanager.googleapis.com`,
  `googlehomefoyer-pa.googleapis.com`). The short-lived tokens derived from it follow the same
  rules.
- **The local channel** only reads `http://<router>/api/v1/status`, a page the router serves
  without authentication on the LAN: it cannot change anything.
- The image runs as a non-root user on a read-only root filesystem and writes nothing to
  `/data` for now.

## Good practices for users

- Keep the refresh token only in the integration's secret field; never paste it in a forum or
  an issue.
- If you think the token leaked, revoke it in your Google account (Security → Third-party
  connections) and paste a new one.
- Use the local channel alone if you do not need the cloud features.
- Keep Gladys and the integration up to date.
