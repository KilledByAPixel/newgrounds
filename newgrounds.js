// Newgrounds JavaScript API
// MIT License - Copyright 2020 Frank Force
//
// Small self contained wrapper for the Newgrounds API 3.0
// - Encrypts medal unlocks and posted scores, the calls Newgrounds secures, with the browser's built in Web Crypto API
// - Every call is a fetch, so the functions return promises; one that takes over 15 seconds fails
// - Await Newgrounds.ready (or Newgrounds.Init) for the medals, scoreboards, and user
// - Without a session the medal and scoreboard lists still load; unlocking on the server and posting scores need a login
// - When logged in, a medal unlocks once the server confirms, and one whose request did not reach the server is resent
// - Checks the session every minute when logged in, which keeps it alive, and plays as a guest once it is lost
// - Tells the Newgrounds page around the game when a medal unlocks or a score posts, as the official client does

'use strict';

const enableNewgrounds = 1;

const Newgrounds =
{
    secureComponents: ['Medal.unlock', 'ScoreBoard.postScore'], // the calls encrypted with a cipher
    sessionErrors: [104, 110, 111], // expired session, login required, session cancelled
    timeoutMS: 15e3,                // how long a request may take before it fails

    /** Set up the Newgrounds connection, check the session, and fetch the medals and scoreboards
     *  - Logs a view right away, for a guest and a logged in player alike
     *  @param {string} app_id   - The Newgrounds App ID
     *  @param {string} [cipher] - The encryption key from the app's settings, AES-128 as Base64
     *  @param {boolean} [debug] - Log every response to the console
     *  @return {Promise<Object>} - Resolves with the Newgrounds object once the session is checked and the lists are in,
     *    empty if the server could not be reached */
    Init(app_id, cipher, debug = 0)
    {
        this.app_id = app_id;
        this.cipher = cipher;
        this.cryptoKey = undefined; // the cipher imported for Web Crypto, on the first encrypted call
        this.debug = debug;
        clearInterval(this.keepAliveInterval); // stop the previous session check if Init is called again
        this.keepAliveInterval = undefined;
        this.medalDisplayTime = 5;
        this.showPopups = 1;
        this.showDescriptions = 1;
        this.displayMedalQueue = [];
        this.medals = [];
        this.scoreboards = [];
        this.user = null;                 // the logged in player once ready, with id, name, url and supporter
        this.pendingUnlocks = new Map;    // medal index to the promise of its unlock request, until the server confirms
        this.unlocksToResend = new Set;   // medal indexes whose unlock request did not reach the server
        this.responseText = '';
        this.points = [5, 10, 25, 50, 100]; // fallback medal points by difficulty

        // get session id from url search params, null when not logged in or once the session is lost
        const url = new URL(location.href);
        this.session_id = url.searchParams.get('ngio_session_id');
        this.host = location.hostname;

        if (cipher && !(typeof crypto != 'undefined' && crypto.subtle))
            console.warn('Newgrounds: a cipher needs Web Crypto, which the browser only has on a secure page (https, localhost, or file)');

        this.ready = enableNewgrounds ? this.InitAsync() : Promise.resolve(this);
        return this.ready;
    },

    // log the view, check the session, fetch the medals and scoreboards, then keep the session alive
    async InitAsync()
    {
        this.Call('App.logView', {host:this.host}); // every view counts, guest or logged in

        let medalList;
        if (this.session_id)
        {
            // the player is logged in when the server knows the session, it has a user, and the medals come in
            const sessionResult = await this.Call('App.checkSession');
            const session = sessionResult?.result?.data?.session;
            const user = session && !session.expired && session.user;
            medalList = user && (await this.Call('Medal.getList'))?.result?.data?.medals;
            if (medalList && this.session_id)
                this.user = user;
            else
            {
                this.DropSession(); // without the server (offline / expired session / server error), or lost meanwhile
                medalList = undefined; // its unlocks belong to the lost session
            }
        }

        // not logged in, the list comes too, without the unlocks
        medalList = medalList || (await this.Call('Medal.getList'))?.result?.data?.medals;
        this.medals = medalList || [];
        for (const medal of this.medals)
        {
            medal.image = new Image;
            medal.image.src = medal.icon;
        }

        // get list of scoreboards
        const scoreboardResult = await this.Call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult?.result?.data?.scoreboards ?? [];
        if (!this.session_id)
            return this;

        // logged in, check the session every minute, which keeps it alive, and resend the unlocks that did not reach the server
        this.keepAliveInterval = setInterval(async ()=>
        {
            const response = await this.Call('App.checkSession');
            const session = response?.result?.data?.session;
            if (this.IsSessionLost(response) || session && (session.expired || !session.user))
                return this.DropSession();
            this.ResendUnlocks();
        }, 60e3);
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

    /** Unlock a medal and show its popup
     *  - As a guest the medal unlocks right away, for this page only
     *  - When logged in the medal unlocks once the server confirms; a request that did not reach the server is sent again
     *    after the session check every minute, one the server refused is not
     *  - Calling it again while the medal is pending returns the same promise
     *  - An answer that the session is gone makes the game play as a guest, and the medal unlocks right away
     *  @param {number} index - Index into the medals list
     *  @return {Promise<boolean>} - Whether the medal is unlocked, once the server has answered when logged in */
    UnlockMedal(index)
    {
        const medal = this.medals?.[index];
        if (!enableNewgrounds || !medal)
            return Promise.resolve(false);
        if (medal.unlocked)
            return Promise.resolve(true);
        if (!this.session_id)
        {
            // a guest, nothing to send
            this.ShowUnlocked(index);
            return Promise.resolve(true);
        }

        // logged in: the medal unlocks once the server confirms, one request at a time
        if (this.pendingUnlocks.has(index))
            return this.pendingUnlocks.get(index);
        const request = this.Call('Medal.unlock', {id:medal.id}).then(response=>
        {
            if (this.IsSessionLost(response))
                this.DropSession(); // the pending unlocks, this one too, unlock as a guest now
            const serverMedal = response?.result?.data?.medal;
            if (!serverMedal?.unlocked)
            {
                // still pending, a request that did not reach the server waits for the session check every minute
                this.debug && console.log('Newgrounds did not unlock medal', medal.id, response?.result?.data?.error || response?.error);
                if (this.session_id && !response)
                    this.unlocksToResend.add(index);
                return !!medal.unlocked;
            }

            // take the server's medal data, so a secret medal shows its real icon once unlocked
            if (serverMedal.icon && serverMedal.icon != medal.icon)
                (medal.image = new Image).src = serverMedal.icon;
            Object.assign(medal, serverMedal);
            this.pendingUnlocks.delete(index);
            this.NotifyPage('Medal.unlock', medal.id);
            this.ShowUnlocked(index);
            return true;
        });
        this.pendingUnlocks.set(index, request);
        return request;
    },

    // mark a medal unlocked and queue its popup
    ShowUnlocked(index)
    {
        this.medals[index].unlocked = true;
        if (this.showPopups)
            this.displayMedalQueue.push({index, time:0});
    },

    /** Send the unlocks whose request did not reach the server again, which the session check does every minute
     *  - A request still out is left to answer */
    ResendUnlocks()
    {
        const indexes = [...this.unlocksToResend];
        this.unlocksToResend.clear();
        for (const index of indexes)
        {
            this.pendingUnlocks.delete(index);
            this.UnlockMedal(index); // a failure is only added back once the new request answers
        }
    },

    /** Play as a guest from now on: stop the session check, keep the unlocks the server confirmed, and unlock the ones
     *  still out right away */
    DropSession()
    {
        if (!this.session_id)
            return;
        this.debug && console.log('Newgrounds session unavailable; playing as a guest');
        this.session_id = null;
        this.user = null;
        clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = undefined;

        // the unlocks still out unlock as a guest now
        const pending = [...this.pendingUnlocks.keys()];
        this.pendingUnlocks.clear();
        this.unlocksToResend.clear();
        for (const index of pending)
            this.UnlockMedal(index);
    },

    /** Post a score to a scoreboard, which needs a logged in player
     *  @param {number} index - Index into the scoreboards list
     *  @param {number} value - The score value, a whole number
     *  @return {Promise<Object>|undefined} - The response JSON object, undefined when there is no such scoreboard or the
     *    call failed; result.data.success says whether it posted; an answer that the session is gone makes the game play
     *    as a guest, and one that timed out may still have posted */
    PostScore(index, value)
    {
        if (!enableNewgrounds || !this.scoreboards?.[index])
            return;

        const board = this.scoreboards[index];
        return this.Call('ScoreBoard.postScore', {id:board.id, value}).then(response=>
        {
            response?.result?.data?.success && this.NotifyPage('ScoreBoard.postScore', board.id);
            this.IsSessionLost(response) && this.DropSession();
            return response;
        });
    },

    /** Get scores from a scoreboard
     *  @param {number} index           - Index into the scoreboards list
     *  @param {string|number} [user]   - A user's id or name, to load only their scores
     *  @param {boolean} [social]       - If true, only the scores of the user and their friends, the logged in player when
     *    user is left out
     *  @param {number} [skip]          - Number of scores to skip over
     *  @param {number} [limit]         - Number of scores to include in the list
     *  @param {string} [period]        - 'D' today, which the server assumes when left out, 'W' this week, 'M' this month,
     *    'Y' this year, or 'A' all time
     *  @return {Promise<Object>|undefined} - The response JSON object, undefined when there is no such scoreboard or the
     *    call failed; the scores are in result.data.scores, each with user.name, value and formatted_value; without a
     *    user or social it is the whole board */
    GetScores(index, user, social = false, skip = 0, limit = 10, period)
    {
        if (!enableNewgrounds || !this.scoreboards?.[index])
            return;

        // the whole board goes without the session, which the server would narrow down to the logged in player
        const board = this.scoreboards[index];
        const session_id = user || social ? this.session_id : null;
        return this.Call('ScoreBoard.getScores', {id:board.id, user, social, skip, limit, period}, session_id);
    },

    // whether the server answered that the session is gone, as opposed to a request that failed on the way
    IsSessionLost(response)
    {
        return this.sessionErrors.includes(response?.result?.data?.error?.code ?? response?.error?.code);
    },

    // tell the Newgrounds page around the game, with the message the official client sends
    NotifyPage(component, id)
    {
        globalThis.top?.postMessage(JSON.stringify({ngioComponent:component, id}), '*');
    },

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
     *  - With a cipher, medal unlocks and posted scores are encrypted, the calls Newgrounds secures
     *  @param {string} component         - Name of the component
     *  @param {Object} [parameters]      - Parameters to use for call
     *  @param {string|null} [session_id] - The session to send, the player's by default
     *  @return {Promise<Object>} - The response JSON object, undefined when the call failed or took over 15 seconds;
     *    a component's own success and error are in result.data */
    async Call(component, parameters, session_id = this.session_id)
    {
        const url = 'https://www.newgrounds.io/gateway_v3.php';
        try
        {
            let execute = {component, parameters};
            if (this.cipher && this.secureComponents.includes(component))
                execute = {secure: await this.Encrypt(JSON.stringify(execute))}; // only the encrypted call goes

            // build the request object, in the form the Newgrounds.io docs give
            const request = {app_id:this.app_id, session_id, execute};

            // send it as post data
            const formData = new FormData();
            formData.append('request', JSON.stringify(request));
            const signal = globalThis.AbortSignal?.timeout?.(this.timeoutMS); // a stalled request fails
            const response = await fetch(url, {method:'POST', body:formData, signal});
            const text = await response.text();
            this.debug && console.log(text);
            this.responseText = text;
            return text ? JSON.parse(text) : undefined;
        }
        catch(e) { this.debug && console.log('Newgrounds call failed', e); }
    },
};
