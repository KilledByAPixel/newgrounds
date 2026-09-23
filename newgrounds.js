// Newgrounds JavaScript API
// MIT License - Copyright 2020 Frank Force
//
// Small self contained wrapper for the Newgrounds API 3.0
// - Encrypts calls with the browser's built in Web Crypto API, no library needed
// - Every call is a fetch, so the functions return promises
// - Await Newgrounds.ready (or Newgrounds.Init) for the medals and scoreboards

'use strict';

const enableNewgrounds = 1;

const Newgrounds =
{
    /** Set up the Newgrounds connection and fetch the medals and scoreboards
     *  @param {string} app_id   - The Newgrounds App ID
     *  @param {string} [cipher] - The encryption key from the app's settings, AES-128 as Base64
     *  @param {boolean} [debug] - Log every response and start with all medals locked
     *  @return {Promise<Object>} - Resolves with the Newgrounds object once medals and scoreboards are loaded */
    Init(app_id, cipher, debug = 0)
    {
        this.app_id = app_id;
        this.cipher = cipher;
        this.cryptoKey = undefined; // the cipher imported for Web Crypto, on the first encrypted call
        this.debug = debug;
        clearInterval(this.keepAliveInterval); // stop the previous ping if Init is called again
        this.keepAliveInterval = undefined;
        this.medalDisplayTime = 5;
        this.showPopups = 1;
        this.showDescriptions = 1;
        this.displayMedalQueue = [];
        this.medals = [];
        this.scoreboards = [];
        this.responseText = '';
        this.points = [5, 10, 25, 50, 100]; // fallback medal points by difficulty

        // get session id from url search params, null when not logged in
        const url = new URL(location.href);
        this.session_id = url.searchParams.get('ngio_session_id');
        this.host = location.hostname;

        if (cipher && !(typeof crypto != 'undefined' && crypto.subtle))
            console.warn('Newgrounds: a cipher needs Web Crypto, which the browser only has on a secure page (https, localhost, or file)');

        this.ready = enableNewgrounds ? this.InitAsync() : Promise.resolve(this);
        return this.ready;
    },

    // fetch the medals and scoreboards, log the view, then keep the session alive
    async InitAsync()
    {
        this.LogView();

        // get list of medals
        const medalsResult = await this.Call('Medal.getList');
        if (!medalsResult?.result?.data?.success)
        {
            // bail early if the first call failed (offline / bad app id / server error)
            this.debug && console.log('Newgrounds unavailable; skipping init');
            return this;
        }

        this.medals = medalsResult.result.data.medals ?? [];
        for (const medal of this.medals)
        {
            medal.image = new Image;
            medal.image.src = medal.icon;
            if (this.debug)
                medal.unlocked = 0;
        }

        // get list of scoreboards
        const scoreboardResult = await this.Call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult?.result?.data?.scoreboards ?? [];

        // keep the session alive with a ping every minute
        if (this.session_id)
        {
            const keepAliveMS = 60 * 1e3;
            this.keepAliveInterval = setInterval(()=> this.Call('Gateway.ping'), keepAliveMS);
        }
        return this;
    },

    /** Advance the medal popup queue
     *  @param {number} delta - Time since the last update in seconds */
    Update(delta)
    {
        if (this.displayMedalQueue?.length)
        {
            const medal = this.displayMedalQueue[0];
            medal.time += delta;
            if (medal.time > this.medalDisplayTime)
                this.displayMedalQueue.shift();
        }
    },

    /** Draw the most recently unlocked medal popup in the bottom left of the canvas
     *  @param {CanvasRenderingContext2D} context
     *  @param {number} [size] - Height of the medal popup in pixels */
    Render(context, size = 50)
    {
        // show most recently unlocked medal
        if (this.displayMedalQueue?.length)
        {
            const medal = this.displayMedalQueue[0];
            const slideOnPercent = medal.time < 1 ? 1-medal.time : 0;
            const alpha = medal.time > this.medalDisplayTime - 1 ?
                this.medalDisplayTime - medal.time : 1;

            const y = context.canvas.height + slideOnPercent * size * 1.5;
            this.RenderMedal(context, medal.index, 0, y - size, size, alpha);
        }
    },

    /** Get the point value of a medal, from the API or by difficulty if not yet assigned
     *  @param {Object} medal - A medal object from the medals list
     *  @return {number} */
    GetMedalPoints(medal)
    {
        return medal.value || this.points[medal.difficulty - 1] || 0;
    },

    /** Get the text shown for a medal: name, point value, and description
     *  @param {Object} medal - A medal object from the medals list
     *  @return {string} */
    GetMedalDisplayText(medal)
    {
        return unescape(medal.name
            + ' (' + this.GetMedalPoints(medal) + ')'
            + (this.showDescriptions ? ' - ' + medal.description : ''));
    },

    /** Draw a medal icon and text
     *  @param {CanvasRenderingContext2D} context
     *  @param {number} index - Index into the medals list
     *  @param {number} x
     *  @param {number} y
     *  @param {number} h - Height of the medal in pixels
     *  @param {number} [alpha] */
    RenderMedal(context, index, x, y, h, alpha = .5)
    {
        if (!enableNewgrounds || !this.medals?.[index])
            return;

        // setup draw state
        context.save();
        context.fillStyle = '#fff';
        context.strokeStyle = '#000';
        context.shadowColor = '#000';
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.font = (h/2)+'px impact';
        context.lineWidth = h/35;
        context.shadowBlur = h/5;
        context.globalAlpha = alpha;

        // draw medal icon
        const medal = this.medals[index];
        context.drawImage(medal.image, x, y, h, h);
        context.strokeRect(x, y, h, h);

        // draw medal text
        const text = this.GetMedalDisplayText(medal);
        context.lineWidth = Math.max(1, h/26);
        context.strokeText(text, x + h*1.2, y + h/2);
        context.fillText(text, x + h*1.2, y + h/2);
        context.restore();
    },

    /** Unlock a medal if not already unlocked and show its popup
     *  @param {number} index - Index into the medals list
     *  @return {Promise<Object>|undefined} - The response JSON object */
    UnlockMedal(index)
    {
        if (!enableNewgrounds || !this.medals?.[index])
            return;

        const medal = this.medals[index];
        if (medal.unlocked)
            return;

        medal.unlocked = true;
        if (this.showPopups)
            this.displayMedalQueue.push({index, time:0});
        return this.Call('Medal.unlock', {id:medal.id});
    },

    /** Post a score to a scoreboard
     *  @param {number} index - Index into the scoreboards list
     *  @param {number} value - The score value
     *  @return {Promise<Object>|undefined} - The response JSON object */
    PostScore(index, value)
    {
        if (!enableNewgrounds || !this.scoreboards?.[index])
            return;

        const board = this.scoreboards[index];
        return this.Call('ScoreBoard.postScore', {id:board.id, value});
    },

    /** Get scores from a scoreboard
     *  @param {number} index    - Index into the scoreboards list
     *  @param {string} [user]   - A user's id or name
     *  @param {number} [social] - If true, only social scores will be loaded
     *  @param {number} [skip]   - Number of scores to skip over
     *  @param {number} [limit]  - Number of scores to include in the list
     *  @return {Promise<Object>|undefined} - The response JSON object */
    GetScores(index, user, social = 0, skip = 0, limit = 10)
    {
        if (!enableNewgrounds || !this.scoreboards?.[index])
            return;

        const board = this.scoreboards[index];
        return this.Call('ScoreBoard.getScores', {id:board.id, user, social, skip, limit});
    },

    /** Log a view of the app
     *  @return {Promise<Object>} - The response JSON object */
    LogView() { return this.Call('App.logView', {host:this.host}); },

    /** Encrypt text the way the Newgrounds gateway expects, AES-128 CBC with a random iv in front, as Base64
     *  @param {string} text
     *  @return {Promise<string>} */
    async Encrypt(text)
    {
        if (!this.cryptoKey)
        {
            const keyBytes = Uint8Array.from(atob(this.cipher), c=> c.charCodeAt(0));
            if (keyBytes.length != 16)
                throw new Error('Newgrounds: cipher must be an AES-128 key encoded as Base64');
            this.cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
        }
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC', iv}, this.cryptoKey, new TextEncoder().encode(text)));
        const bytes = new Uint8Array(iv.length + encrypted.length);
        bytes.set(iv);
        bytes.set(encrypted, iv.length);
        let binary = '';
        for (const b of bytes)
            binary += String.fromCharCode(b);
        return btoa(binary);
    },

    /** Call a component of the Newgrounds API
     *  @param {string} component    - Name of the component
     *  @param {Object} [parameters] - Parameters to use for call
     *  @return {Promise<Object>}    - The response JSON object, undefined when the call failed */
    async Call(component, parameters)
    {
        const url = 'https://newgrounds.io/gateway_v3.php';
        try
        {
            const call = {component, parameters};
            if (this.cipher)
            {
                // the whole call goes encrypted in its place
                call.secure = await this.Encrypt(JSON.stringify(call));
                call.parameters = null;
            }

            // build the input object
            const input = {app_id:this.app_id, session_id:this.session_id, call};

            // build post data
            const formData = new FormData();
            formData.append('input', JSON.stringify(input));

            // send post data
            const response = await fetch(url, {method:'POST', body:formData});
            const text = await response.text();
            this.debug && console.log(text);
            this.responseText = text;
            return text && JSON.parse(text);
        }
        catch(e) { this.debug && console.log('Newgrounds call failed', e); }
    },
};
