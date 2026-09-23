# A JavaScript Wrapper for Newgrounds API 3.0

# [EXAMPLE GAME - BOUNCE BACK](https://www.newgrounds.com/portal/view/755171)

# Features
- Small self contained wrapper for Newgrounds API 3.0 calls, no dependencies
- Functions provided for medals and scoreboards
- Medal popup display rendering with icons
- Escaped emojis can be used in medal names and descriptions
- Calls are encrypted with AES-128 Base64 using the browser's built in Web Crypto API
- Logs views and keeps the session alive while the game is open
- Every call is a fetch, so the functions return promises

# Example Usage
```js
Newgrounds.Init(appID, encryptionCipher);

// later, once Newgrounds.ready has resolved
Newgrounds.UnlockMedal(0);
Newgrounds.PostScore(0, 12345);
```
`Newgrounds.Init` returns a promise (also available as `Newgrounds.ready`) that resolves once the medals and scoreboards have been fetched. Medals and scoreboards are referenced by their index in that fetched list. `UnlockMedal`, `PostScore`, and `GetScores` return the API response as a promise, or undefined when the call could not be made.

# Optional Update/Render for Medal Popups
```js
Newgrounds.Update(timeDelta);
Newgrounds.Render(canvasContext, drawSize);
```

# Notes
- Encryption uses the Web Crypto API, which browsers only provide on a secure page: https, localhost, or a local file
- Medals and scoreboards load without a login, but unlocking medals and posting scores need the player to be logged in on Newgrounds
- Set `debug` to log every response and start with all medals locked
