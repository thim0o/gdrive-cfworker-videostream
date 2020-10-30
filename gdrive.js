var authConfig = {
    "client_id": "202264815644.apps.googleusercontent.com",
    "client_secret": "X4Z3ca8xfWDb1Voo-F9a7ZxJ",
    "refresh_token": "", // unique
    "root": "allDrives"
};


let gd;


addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});


/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request) {
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
                    linksHtml = linksHtml.replace("SEARCH_RESULT_PLACEHOLDER", `<a href="${link}">${f.name} ${f.size}</a><br><br>\nSEARCH_RESULT_PLACEHOLDER`);
                });
            } else {
                return new Response("Could not load the search results", {
                    status: 500,
                    headers: {'Content-Type': 'text/html; charset=utf-8'}
                });
            }

            linksHtml = linksHtml.replace("SEARCH_RESULT_PLACEHOLDER", "");
            return new Response(linksHtml, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}});


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

    async down(id, range = '') {
        let url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
        let requestOption = await this.requestOption();
        requestOption.headers['Range'] = range;
        return await fetch(url, requestOption);
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


    async getFiles(path, maxRetries = 3) {
        let arr = path.split('/');
        let name = arr.pop();
        name = decodeURIComponent(name).replace(/'/g, "\\'");
        console.log(name);

        let url = 'https://www.googleapis.com/drive/v3/files';
        let params = {'spaces': 'drive'};

        if (authConfig.root === "allDrives") {
            params = {
                'corpora': 'allDrives',
                'includeItemsFromAllDrives': true,
                'supportsAllDrives': true,
                'pageSize': 1000
            };

        } else if (authConfig.root !== "") {
            params = {
                'spaces': 'drive',
                'corpora': 'drive',
                'includeItemsFromAllDrives': true,
                'supportsAllDrives': true,
                'driveId': authConfig.root
            };
        }

        params.q = `fullText contains '${name}' and (mimeType contains 'application/octet-stream' or mimeType contains 'video/') and (name contains 'mkv' or name contains 'mp4' or name contains 'avi') `;
        params.fields = "files(id, name, size, driveId)";

        url += '?' + this.enQuery(params);
        let requestOption = await this.requestOption();

        let response = await fetch(url, requestOption);

        let retries = 0
        while (!response.ok && response.status != 401 && retries < maxRetries) {
            retries += 1
            await sleep(1000 * 2 ** retries)
            response = await fetch(url, requestOption);
            console.log(`Retry nr. ${retries} result: ${response.ok}`)
        }

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

        const response = await fetch(url, requestOption);
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
