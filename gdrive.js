let gd;

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    }
};


/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request, env) {
    const accessToken = env.WORKER_ACCESS_TOKEN;
    const cookie = request.headers.get('Cookie') || '';
    const hasCookie = cookie.split(';').some(value => value.trim() === `worker_access=${accessToken}`);
    if (!accessToken || (request.headers.get('Authorization') !== `Bearer ${accessToken}` && !hasCookie)) {
        return new Response('Unauthorized', {status: 401});
    }

    const authConfig = {
        "client_id": env.GOOGLE_CLIENT_ID,
        "client_secret": env.GOOGLE_CLIENT_SECRET,
        "refresh_token": env.GOOGLE_REFRESH_TOKEN,
        "root": env.GOOGLE_DRIVE_ROOT || "allDrives"
    };
    if (!authConfig.client_id || !authConfig.client_secret || !authConfig.refresh_token) {
        return new Response('Worker is not configured', {status: 503});
    }

    let linksHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<title>Links</title></head>
<body>
SEARCH_RESULT_PLACEHOLDER
</body>
</html>
`;

    if (gd === undefined) {
        gd = new googleDrive(authConfig);
    }

    let url = new URL(request.url);
    let path = url.pathname;
    let action = url.searchParams.get('a');


    if (path.substr(-1) === '/' || action != null) {
        return new Response(linksHtml, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}});
    } else {
        let baseUrl = url.toString().replace(path, "/");

        // If client requests a search
        if (path.startsWith("/search/")) {
            let file = await gd.getFilesCached(path);
            if (file !== undefined) {
                file.forEach(function (f) {
                    let link = baseUrl + encodeURIComponent(f.name);
                    linksHtml = linksHtml.replace("SEARCH_RESULT_PLACEHOLDER", `<a href="${link}">${escapeHtml(f.name)} ${escapeHtml(f.size)}</a><br><br>\nSEARCH_RESULT_PLACEHOLDER`);
                });
            } else {
                return new Response("Could not load the search results", {
                    status: 500,
                    headers: {'Content-Type': 'text/html; charset=utf-8'}
                });
            }

            linksHtml = linksHtml.replace("SEARCH_RESULT_PLACEHOLDER", "");
            return new Response(linksHtml, {status: 200, headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Set-Cookie': `worker_access=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/`
            }});


        } else if (path.startsWith("/searchjson/")) {
            const response = [];
            let file = await gd.getFilesCached(path);
            if (file !== undefined) {
                file.forEach(function (f) {
                    let link = baseUrl + encodeURIComponent(f.name);
                    let size = Math.round(f.size / 2 ** 30 * 100) / 100;
                    let result = {"link": link, "size_gb": size, "file_id": f.id, "drive_id": f.driveId};
                    response.push(result);
                });
            }
            console.log(response)
            return new Response(JSON.stringify(response), {status: 200, headers: {'Content-Type': 'application/json'}});

        } else {
            // If client requests a file
            let file = await gd.getFilesCached(path);
            file = file[0];
            console.log(file);
            let range = request.headers.get('Range');
            return gd.down(file.id, range);
        }
    }
}


class googleDrive {
    constructor(authConfig) {
        this.authConfig = authConfig;
        this.paths = [];
        this.files = [];
        this.paths["/"] = authConfig.root;
        this.accessToken();
    }

    async fetchAndRetryOnError(url, requestOption, maxRetries = 3) {
        let response = await fetch(url, requestOption);
        let retries = 0
        while (!response.ok && response.status != 400 && retries < maxRetries) {
            console.log(response.status);
            await sleep(1000 + 1000 * 2 ** retries)
            retries += 1
            response = await fetch(url, requestOption);
            console.log(`Retry nr. ${retries} result: ${response.ok}`)
        }
        return response
    }

    async down(id, range = '') {
        let url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
        let requestOption = await this.requestOption();
        requestOption.headers['Range'] = range;
        return await this.fetchAndRetryOnError(url, requestOption);
    }

    async getFilesCached(path) {
        if (typeof this.files[path] == 'undefined') {
            let files = await this.getFiles(path)
            if (files !== "FAILED") {
                this.files[path] = files;
            }

        }
        return this.files[path];
    }

    getSearchScopeParams() {
        let params = {'spaces': 'drive'};
        if (this.authConfig.root === "allDrives") {
            params = {
                'corpora': 'allDrives',
                'includeItemsFromAllDrives': true,
                'supportsAllDrives': true,
                'pageSize': 1000
            };

        } else if (this.authConfig.root !== "") {
            params = {
                'spaces': 'drive',
                'corpora': 'drive',
                'includeItemsFromAllDrives': true,
                'supportsAllDrives': true,
                'driveId': this.authConfig.root
            };
        }
        return params
    }

    async getFiles(path) {
        let arr = path.split('/');
        let name = arr.pop();
        name = decodeURIComponent(name).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        console.log(name);

        let url = 'https://www.googleapis.com/drive/v3/files';
        let params = this.getSearchScopeParams()

        params.q = `fullText contains '${name}' and (mimeType contains 'application/octet-stream' or mimeType contains 'video/') and (name contains 'mkv' or name contains 'mp4' or name contains 'avi') `;
        params.fields = "files(id, name, size, driveId)";

        url += '?' + this.enQuery(params);
        let requestOption = await this.requestOption();
        let response = await this.fetchAndRetryOnError(url, requestOption);

        let obj = await response.json();
        console.log(obj);
        console.log(obj.files);

        if (response.ok) {
            return obj.files;
        } else {
            return "FAILED"
        }
    }


    async accessToken() {
        console.log("accessToken");
        if (this.authConfig.expires === undefined || this.authConfig.expires < Date.now()) {
            const obj = await this.fetchAccessToken();
            if (obj.access_token !== undefined) {
                this.authConfig.accessToken = obj.access_token;
                this.authConfig.expires = Date.now() + 3500 * 1000;
            }
        }
        return this.authConfig.accessToken;
    }

    async fetchAccessToken() {
        console.log("fetchAccessToken");
        const url = "https://www.googleapis.com/oauth2/v4/token";
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const post_data = {
            'client_id': this.authConfig.client_id,
            'client_secret': this.authConfig.client_secret,
            'refresh_token': this.authConfig.refresh_token,
            'grant_type': 'refresh_token'
        };

        let requestOption = {
            'method': 'POST',
            'headers': headers,
            'body': this.enQuery(post_data)
        };

        const response = await this.fetchAndRetryOnError(url, requestOption);
        return await response.json();
    }


    async requestOption(headers = {}, method = 'GET') {
        const accessToken = await this.accessToken();
        headers['authorization'] = 'Bearer ' + accessToken;
        return {'method': method, 'headers': headers};
    }

    enQuery(data) {
        const ret = [];
        for (let d in data) {
            ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
        }
        ret.push(encodeURIComponent("acknowledgeAbuse") + '=' + encodeURIComponent("true"));
        return ret.join('&');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
