# gdrive-cfworker-videostream
A cloudflare worker that provides direct links to files on google drive. 
<br>
The worker can search on all your drives (including shared drives), and returns the search results in plaintext or in json format.



<h3>Setup</h3>
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
