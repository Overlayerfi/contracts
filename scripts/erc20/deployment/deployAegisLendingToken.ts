import {
  deployAegisLendingToken,
  AegisLendingTokenProps
} from '../../functions';

const props: AegisLendingTokenProps = {
  minter: '0x0497aC30Ec8e6070abde2Fb09F0De03ccbD653A2',
  allowedTransferer: '0x0497aC30Ec8e6070abde2Fb09F0De03ccbD653A2',
  initialSupplyNotWei: 0,
  name: 'doereceiptUSDC',
  symbol: 'aUSDC'
};

deployAegisLendingToken(props).catch((error) => {
  console.log(error);
  console.log('🛑 Deployment failed');
  process.exit(1);
});
