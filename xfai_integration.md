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

### Estimating gas savings

To get an estimate of how much a user can save on gas fees, call the following endpoint:

`GET https://automate-api.chronologic.network/ethereum/estimateGasSavings`

And the response will be:

`{ "savingsPercent": 82.14 }`

The endpoint compares the current network gas prices with historical gas prices from past few days to come up with the result. The result is an ideal-case scenario and actual savings might be different.

### Getting statistics for a given address

To get data on how many transactions a given address has pending and completed, as well as total savings in USD, call this endpoint:

`GET https://automate-api.chronologic.network/stats/:address` (e.g. `GET https://automate-api.chronologic.network/stats/0x0000000000000000000000000000000000000000`)

And the response will be be:

```json
{
  "pending": 1,
  "completed": 2,
  "savingsUsd": 13.37
}
```
