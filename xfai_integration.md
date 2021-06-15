## Integration instructions for XFai

### Signup link

Users need to sign up to Automate before they can use it. They should be redirected to the special link [`https://automate.chronologic.network/?utm_source=xfai`](https://automate.chronologic.network/?utm_source=xfai) where they will be guided through the signup and setup process. Once done, they will be directed back to XFai.

### Checking if user is connected to Automate RPC

To detect if user is connected to Automate RPC, you can send a special `eth_call` request:

```js
async function isConnectedToAutomate() {
  const res = await window.ethereum.request({
    method: 'eth_call',
    params: [
      {
        from: '0x0000000000000000000000000000000000000000',
        // md5 hash of 'automate'
        to: '0x00000000e7fdc80c0728d856260f92fde10af019',
      },
    ],
  });

  return res.client === 'automate';
}
```
