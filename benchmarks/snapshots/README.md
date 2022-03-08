## Run the Benchmarks

```sh
yarn init:data
yarn load:automerge
```

To reduce the amount of changes used for the benchmark uncomment this line in `initData.js`:

```js
// txns = txns.slice(0, 10000);
```
