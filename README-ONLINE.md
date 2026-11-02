# Milestones Music: putting the site online (Cloudflare)

The site and admin run on Cloudflare, like the FSQ site.
- The website's content lives in GitHub (the `db` folder). Every save in the admin is a GitHub commit, so nothing is ever lost.
- Photos, audio and videos you upload in the admin are stored in Cloudflare R2 storage.
- Logins and booking enquiries are kept in a Cloudflare D1 database (enquiries are never put in GitHub).

You only do this setup once.

## 1. Make a GitHub key for the site
1. On GitHub: your photo (top right) > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
2. Name: `milestones-site`. Expiration: the longest offered (set a reminder to renew it).
3. Repository access: **Only select repositories** > `dilydalel/the-milestones`.
4. Permissions > Repository permissions > **Contents: Read and write** (Metadata: Read is added automatically).
5. Generate, and copy the token (it starts `github_pat_`). Keep it somewhere safe for step 3.

## 2. Connect the repository in Cloudflare
1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Import a repository** (connect GitHub if asked).
2. Choose `dilydalel/the-milestones`.
3. Project name: `the-milestones`. Leave the build command empty. Deploy command: `npx wrangler deploy`.
4. Click **Deploy**. Cloudflare creates the D1 database and the R2 storage automatically.
   If it says R2 needs enabling, open **R2** in the left menu and enable it (the free allowance is 10 GB), then retry.

## 3. Add the secrets
In the worker: **Settings** > **Variables and Secrets** > **Add** (type: Secret) for each:
| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 1 |
| `SESSION_SECRET` | a long random string, e.g. from a password generator (40+ characters) |
| `SETUP_KEY` | any phrase you choose; you type it once in step 4 |

Then **Deployments** > redeploy the latest version (or push any change) so the secrets are picked up.

## 4. Create your admin login
1. Open `https://the-milestones.<your-subdomain>.workers.dev/admin/` (Cloudflare shows the address on the worker page).
2. It asks you to **Create the first admin**: enter the setup key, your name, email and a password.
3. You are signed in. Add band members under **Site > Users** (Editor: can change the website; Admin: can also manage users).

## 5. Email for booking enquiries (when ready)
Enquiries are always saved in the admin under **Enquiries**. To also email them:
1. Make a free account at resend.com and add your domain (it gives you DNS records to add where the domain is managed).
2. Create an API key in Resend.
3. In the worker add a Secret `RESEND_API_KEY` = the key, and set the variable `MAIL_FROM` in `wrangler.jsonc` to e.g. `Milestones Music <enquiries@themilestoneslive.com>`.
4. The address that receives enquiries is set in the admin: **Settings and text > Email that receives enquiries** (several addresses can be separated by commas).

## 6. Using your own domain (later)
While testing, the site runs on the `workers.dev` address and the old WordPress site stays live.
When ready: worker **Settings** > **Domains & Routes** > add `themilestoneslive.com` (the domain must be on Cloudflare).

## Videos
The big old-site videos are not uploaded. On the website a video shows when it has a **YouTube link** (admin: Media > Videos) or an uploaded file. Hero videos can be uploaded in the admin (keep them short: under about 100 MB).

## Working on your Mac
`start.command` still runs the site locally from the files in this folder, exactly as before.
