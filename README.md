# A JavaScript Wrapper for Newgrounds API 3.0

# [LIVE DEMO](https://www.newgrounds.com/portal/view/755888?updated=1590185509)
# [EXAMPLE GAME - BOUNCE BACK](https://www.newgrounds.com/portal/view/755171)

# Features
- Wrapper for Newgrounds API 3.0 calls
- Functions provided for medals and soreboards
- Medal popup display rendering with icons
- Escaped emojis can be used in medal names and descriptions.
- Encryption is set up for AES-128 Base64 encryption.
- [Uses CryptoJS for encryption.](https://github.com/brix/crypto-js)

# Example Usage
```
Newgrounds.Init(appID, encryptionCipher, debug);
Newgrounds.UnlockMedal(0);
Newgrounds.PostScore(0, 12345);
```
# Optional Update/Render for Medal Popups
```
Newgrouinds.Update(timeDelta);
Newgrounds.Render(canvasContext, drawSize);
```
