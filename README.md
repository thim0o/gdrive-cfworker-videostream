# gdrive-cfworker-videostream
A cloudflare worker that provides direct links to files on google drive. 
<br>
The worker can search on all your drives (including shared drives), and returns the search results in plaintext or in json format.



<h3>Setup</h3>
Configure these Cloudflare Worker secrets/variables before deploying:

* `WORKER_ACCESS_TOKEN` - required bearer token for every request
* `GOOGLE_CLIENT_ID`
* `GOOGLE_CLIENT_SECRET`
* `GOOGLE_REFRESH_TOKEN`
* `GOOGLE_DRIVE_ROOT` (optional, defaults to `allDrives`)

The Google OAuth client secret and refresh token must not be committed to this repository.
Send `Authorization: Bearer <WORKER_ACCESS_TOKEN>` with the first request. The worker sets a secure, HTTP-only cookie so links in the HTML response continue to work in a browser.

<b>Follow the instructions on this page for an easy setup</b>
https://gdrive-cfworker.glitch.me/

<h3>Usage</h3>
After you create the cloudflare worker, take note of its url which looks like https://x.y.workers.dev:
You can change this url on the cloudflare workers page, but make sure it's non-guessable. 

The requests you can make to this url are:


| GET request  | Response |
| ------------- | ------------- |
| x.y.workers.dev/search/*SomeSearchQuery*  | Search results on an html page  |
| x.y.workers.dev/searchjson/*SomeSearchQuery*  | Search results in json format |

Credits go to https://github.com/maple3142/GDIndex for large parts of the code
