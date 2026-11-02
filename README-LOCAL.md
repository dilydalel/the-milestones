# Milestones Music: running the site on this Mac

## Start
Double-click **start.command** in this folder. A Terminal window opens and your browser shows:
- the website: http://localhost:3000
- the admin: http://localhost:3000/admin

(Or in Terminal: `cd` into this folder, then `node server.js`.)

## Seeing changes
- Changes saved in the admin: just refresh the website page.
- Changes to the site's code: start.command restarts the site by itself (needs Node 20 or newer), then refresh. With older Node, stop and start it again.

## Stop
Click the Terminal window and press **Ctrl+C**, or close the window.

## How it works
- Everything you save in the admin is stored in the **db** folder and shows on the website as soon as you refresh the page.
- Every save keeps a backup in **db/_backups** (the last 30 versions of each file).
- Files you upload go into **assets/uploads**.
- Booking form enquiries are saved in **private/enquiries.json** and shown in the admin under Enquiries.
- Emails are **not sent yet**: each one is written as a text file in the **outbox** folder so you can see what would be sent.
- Only this Mac can open the site and admin. There is no login yet.

## Not done yet (for the Cloudflare version)
- Admin login with users and roles
- Real email sending for enquiries
- Hosting online (Cloudflare) and GitHub

## Rebuilding the database from the old-site data
`node tools/import-old-site.js --force` throws away the current db (after copying it to a backup folder) and rebuilds it from the data folder. Only do this if you mean to start again.
