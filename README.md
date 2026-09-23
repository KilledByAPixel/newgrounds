# A JavaScript Wrapper for Newgrounds API 3.0

A small, self-contained, dependency-free wrapper for the [Newgrounds.io](https://www.newgrounds.io/) API, with medals, scoreboards, and canvas-drawn medal popups.

### [Example Game - Bounce Back](https://www.newgrounds.com/portal/view/755171)

## Features
- One file, no dependencies
- Medals and scoreboards
- Medal popup rendering with icons, for any 2D canvas
- Escaped emojis can be used in medal names and descriptions
- Calls are encrypted with AES-128 using the browser's built-in Web Crypto API
- Logs views and keeps the player's session alive while the game is open
- Every call uses `fetch` and returns a promise

## Setup
1. In your project's Newgrounds.io settings, copy the **App ID**.
2. Under encryption settings, choose **AES-128** with **Base64** encoding and copy the key. Encryption is optional but recommended.
3. Include the script and call `Init` when the game starts.

```html
<script src="newgrounds.js"></script>
```

## Example Usage
```js
Newgrounds.Init(appID, encryptionCipher);

// later, once Newgrounds.ready has resolved
Newgrounds.UnlockMedal(0);
Newgrounds.PostScore(0, 12345);
```

`Newgrounds.Init` returns a promise, also available as `Newgrounds.ready`, that resolves once the medals and scoreboards have been fetched. Medals and scoreboards are referenced by their index in the fetched lists, `Newgrounds.medals` and `Newgrounds.scoreboards`.

`UnlockMedal`, `PostScore`, and `GetScores` return the API response as a promise. They return undefined when there was nothing to do, such as an unknown index or an already unlocked medal, or when the call failed.

```js
async function ShowTopScores()
{
    await Newgrounds.ready;
    const response = await Newgrounds.GetScores(0);
    console.log(response?.result?.data?.scores);
}
```

## Optional Update/Render for Medal Popups
Call these every frame to show a popup in the bottom left of the canvas when a medal unlocks.
```js
Newgrounds.Update(timeDelta);  // time since last frame in seconds
Newgrounds.Render(canvasContext, drawSize);
```

## Notes
- Encryption uses the Web Crypto API, which browsers only provide on a secure page: https, localhost, or a local file.
- Medals and scoreboards load without a login. Unlocking medals and posting scores need the player to be logged in, which Newgrounds provides through the `ngio_session_id` URL parameter when the game runs on the site.
- Pass `true` as the third argument to `Init` to log every response and start with all medals locked.
- Set `enableNewgrounds` to 0 at the top of the file to turn off all calls, for example on other hosting sites.

## LittleJS
A version of this wrapper is included as a plugin with the [LittleJS](https://github.com/KilledByAPixel/LittleJS) game engine.
