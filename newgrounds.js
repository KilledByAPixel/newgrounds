// Newgrounds JavaScript API
// MIT License - Copyright 2020 Frank Force

"use strict";

const enableNewgrounds = 1;

const Newgrounds = 
{
    Init(app_id, cipher = 0, debug = 0)
    {
        this.app_id = app_id;
        this.cipher = cipher;
        this.medalDisplayTime = 5;
        this.showPopups = 1;
        this.showDescriptions = 1;
        this.points = [5, 10, 25, 50, 100];
        this.displayMedalQueue = [];
        this.debug = debug;
        
        if (!enableNewgrounds)
            return;
            
        // get session id from url search params
        const url = new URL(window.location.href);
        this.session_id = url.searchParams.get('ngio_session_id') ?? 0;
    
        // get list of scoreboards
        const scoreboardResult = this.Call('ScoreBoard.getBoards', 0, 0);
        this.scoreboards = scoreboardResult?.result?.data?.scoreboards ?? [];
        
        // get list of medals
        const resultMedals = this.Call('Medal.getList', 0, 0);
        this.medals = resultMedals?.result?.data?.medals ?? [];
        for (const medal of this.medals)
        {
            medal.image = new Image();
            medal.image.src = medal.icon;
            if (this.debug)
                medal.unlocked = 0;
        }
    },

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

    Render(context, size = 50)
    { 
        // show most recently unlocked medal
        if (this.displayMedalQueue?.length)
        {
            const medal = this.displayMedalQueue[0];
            const slideOnPecent = medal.time < 1 ? 1-medal.time : 0;
            const alpha = medal.time > this.medalDisplayTime - 1 ?
                this.medalDisplayTime - medal.time : 1;

            const y = context.canvas.height + slideOnPecent * size * 1.5;
            this.RenderMedal(context, medal.index, 0, y - size, size, alpha);
        }
    },
    
    GetMedalDisplayText( medal )
    {
        return unescape(medal.name
            + ' (' + this.points[medal.difficulty - 1] + ')'
            + (this.showDescriptions? ' - ' + medal.description : ''));
    },

    RenderMedal(context, index, x, y, h, alpha=.5)
    {
        if (!enableNewgrounds || !this.medals || !this.medals[index])
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
        const points = this.points[medal.difficulty - 1];
        const text = this.GetMedalDisplayText(medal);
        context.lineWidth = Math.max(1,h/26);
        context.strokeText(text, x + h*1.2, y+h/2);
        context.fillText(text, x + h*1.2, y+h/2);
        context.restore();
    },

    UnlockMedal(index)
    {
        if (!enableNewgrounds || !this.medals || !this.medals[index])
            return;
        
        const medal = this.medals[index];
        if (medal.unlocked)
            return;
        
        medal.unlocked = true;
        this.Call('Medal.unlock', {id:medal.id});
        if (this.showPopups)
            this.displayMedalQueue.push({index:index, time:0});
    },

    PostScore(index, value)
    {
        if (!enableNewgrounds || !this.scoreboards || !this.scoreboards[index])
            return;
            
        const board = this.scoreboards[index];
        this.Call('ScoreBoard.postScore', {id:board.id, value});
    },

    GetScores(index, user=0, social=0, skip=0, limit=10)
    {
        if (!enableNewgrounds || !this.scoreboards || !this.scoreboards[index])
            return;
            
        const board = this.scoreboards[index];
        this.Call('ScoreBoard.getScores', 
            {id:board.id, user, social, skip, limit}, 0);
    },
    Call(component, parameters=0, async=1)
    {
        // build the input object
        const call = this.EncryptCall({component, parameters});
        const input = 
        {
            app_id: this.app_id,
            session_id: this.session_id,
            debug: this.debug,
            call
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));
        
        // send post data
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';
        xmlHttp.open('POST', url, this.debug? 0 : async);
        xmlHttp.send(formData);
        
        if (xmlHttp.responseText)
        {
            if (this.debug)
                console.log(xmlHttp.responseText);

            this.responseText = xmlHttp.responseText;
            return JSON.parse(xmlHttp.responseText);
        }
    },
    
    EncryptCall(call)
    {
        if (!this.cipher)
            return call;
        
        // apply encryption
        const secure = this.AES128(JSON.stringify(call), this.cipher);
        return { secure };
    },
    
    AES128(text, cipher)
    {
        // The initialization vector (must be 16 bytes)
        // TODO: add randomization
        const iv = [ 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36 ];

        // Convert text to bytes
        const pad = 16;
        text = text.padEnd( (1+(text.length-1)/pad|0)*pad );
        const textBytes = aesjs.utils.utf8.toBytes(text);

        const key = aesjs.utils.utf8.toBytes(atob(cipher));
        const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
        const encryptedBytes = aesCbc.encrypt(textBytes);

        if (this.debug)
        {
            // show decryped text
            const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
            const decryptedBytes = aesCbc.decrypt(encryptedBytes);
            const decryptedText = aesjs.utils.utf8.fromBytes(decryptedBytes);
            console.log(decryptedText);
        }
    
        const ivAndEncryptedBytes = [...iv, ...encryptedBytes];
        return btoa(ivAndEncryptedBytes);
    },
};