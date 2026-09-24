# A JavaScript Wrapper for Newgrounds API 3.0

A small, self-contained, dependency-free wrapper for the [Newgrounds.io](https://www.newgrounds.io/) API, with medals, scoreboards, and canvas-drawn medal popups.

### [Example Game - Bounce Back](https://www.newgrounds.com/portal/view/755171)

## Features
- One file, no dependencies
- Medals and scoreboards, for guests and logged in players
- Medal popup rendering with icons, for any 2D canvas
- Escaped emojis can be used in medal names and descriptions
- Calls are encrypted with AES-128 using the browser's built-in Web Crypto API
- Checks the player's session and provides their name
- When logged in, medals unlock once the server confirms, and a failed unlock is retried every minute
- Logs views and keeps the player's session alive while the game is open
- Every call uses `fetch` and returns a promise

## Setup
1. In your project's Newgrounds.io API Tools page, copy the **App ID**.
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

`Newgrounds.Init` returns a promise, also available as `Newgrounds.ready`. It resolves once the session is checked and the medals and scoreboards have been fetched. Medals and scoreboards are referenced by their index in the fetched lists, `Newgrounds.medals` and `Newgrounds.scoreboards`.

```js
async function ShowTopScores()
{
    await Newgrounds.ready;
    const response = await Newgrounds.GetScores(0, undefined, false, 0, 10, 'A'); // top 10 of all time
    const scores = response?.result?.data?.scores || []; // each with user.name, value and formatted_value
    for (const score of scores)
        console.log(score.user.name, score.formatted_value);
}
```

## Guests and Logged In Players
Newgrounds passes a session to the game through the `ngio_session_id` URL parameter when it runs on the site. `Init` checks that session with the server.

- **Logged in.** `Newgrounds.user` holds the player, with `id`, `name`, `url`, and `supporter`. Their medal unlocks come from the server. `UnlockMedal` sends the unlock and the medal only unlocks and shows its popup once the server confirms. If the request fails, it is resent every minute until it succeeds.
- **Guest.** With no session, or one the server refuses, the game plays as a guest and `Newgrounds.user` is null. The medal and scoreboard lists still load, so names, icons, and leaderboards work. `UnlockMedal` unlocks and shows the popup right away, but nothing is saved, so the medal is locked again on the next visit. Posting scores needs a login.

## API
| Function | Description |
| --- | --- |
| `Init(appID, cipher, debug)` | Log a view, check the session, and fetch the medals and scoreboards. Returns `ready`. |
| `UnlockMedal(index)` | Unlock a medal and show its popup. Resolves with whether the medal is unlocked, once the server has answered when logged in. |
| `PostScore(index, value)` | Post a whole number score. Needs a login. `result.data.success` says whether it posted. |
| `GetScores(index, user, social, skip, limit, period)` | Read scores. Period is `'D'` today, the default, `'W'`, `'M'`, `'Y'`, or `'A'` for all time. |
| `ResendUnlocks()` | Send unconfirmed unlocks again now. The keep-alive ping does this every minute. |
| `Call(component, parameters)` | Call any [Newgrounds.io component](https://www.newgrounds.io/help/components/) directly. |

`PostScore` and `GetScores` resolve with the response, or undefined when the index is unknown or the call failed.

## Optional Update/Render for Medal Popups
Call these every frame to show a popup in the bottom left of the canvas when a medal unlocks.
```js
Newgrounds.Update(timeDelta);  // time since last frame in seconds
Newgrounds.Render(canvasContext, drawSize);
```

## Notes
- Encryption uses the Web Crypto API, which browsers only provide on a secure page: https, localhost, or a local file.
- Pass `true` as the third argument to `Init` to log every response to the console.
- Set `enableNewgrounds` to 0 at the top of the file to turn off all calls, for example on other hosting sites.

## LittleJS
A version of this wrapper is included as a plugin with the [LittleJS](https://github.com/KilledByAPixel/LittleJS) game engine. It works the same way and adds a local save for guests' medals.
