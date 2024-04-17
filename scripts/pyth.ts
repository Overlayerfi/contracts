import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js/lib/EvmPriceServiceConnection';

async function getPrice() {
  const connection = new EvmPriceServiceConnection(
    'https://xc-testnet.pyth.network'
  ); // See Price Service endpoints section below for other endpoints

  const priceIds = [
    // You can find the ids of prices at https://pyth.network/developers/price-feed-ids#pyth-evm-testnet
    '0x475a251c7cbded7645a146fc049d44058aa977e6850f20f4c86e289fb8dbe4f8' // CRO/USD price id in testnet
  ];

  // In order to use Pyth prices in your protocol you need to submit the price update data to Pyth contract in your target
  // chain. `getPriceFeedsUpdateData` creates the update data which can be submitted to your contract. Then your contract should
  // call the Pyth Contract with this data.
  const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

  // Call this to get price for UI
  //const priceUpdateData = await connection.getLatestPriceFeeds(priceIds);

  // If the user is paying the price update fee, you need to fetch it from the Pyth contract.
  // Please refer to https://docs.pyth.network/consume-data/on-demand#fees for more information.
  //
  // `pythContract` below is a web3.js contract; if you wish to use ethers, you need to change it accordingly.
  // You can find the Pyth interface ABI in @pythnetwork/pyth-sdk-solidity npm package.
  //const updateFee = await pythContract.methods
  //	.getUpdateFee(priceUpdateData)
  //	.call();
  // Calling someContract method
  // `someContract` below is a web3.js contract; if you wish to use ethers, you need to change it accordingly.
  //await someContract.methods
  //	.doSomething(someArg, otherArg, priceUpdateData)
  //	.send({ value: updateFee });
}

getPrice()
  .then(() => {})
  .catch((e) => {
    console.error(e);
  });
