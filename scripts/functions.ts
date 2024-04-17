import { ethers, upgrades } from 'hardhat';
import { CRONOS_MAINNET_RPC, CRONOS_TESTNET_RPC } from './constants';
import erc20abi from '../artifacts/contracts/erc20/FixedSupplyAegisErc20.sol/FixedSupplyAegisERC20.json';
import mintableErc20abi from '../artifacts/contracts/erc20/MintableAegisERC20.sol/MintableAegisERC20.json';
import mintableLendingErc20abi from '../artifacts/contracts/erc20/AegisLendingToken.sol/AegisLendingToken.json';
import launchpadAbi from '../artifacts/contracts/launchpad/AegisLaunchpad.sol/AegisLaunchpad.json';
import vaultAbi from '../artifacts/contracts/vaults/AegisVault.sol/AegisVault.json';
import aegisLendingAbi from '../artifacts/contracts/lending-borrowing/single-borrower/AegisLending.sol/AegisLending.json';
import aegisRouterOracleAbi from '../artifacts/contracts/oracles/AegisRouterOracle.sol/AegisRouterOracle.json';
import * as dotenv from 'dotenv';
import { env } from '../hardhat.config';

dotenv.config({
  path:
    process.cwd() + env === 'prod'
      ? '/scripts/processProd.env'
      : '/scripts/process.env'
});

const NETWORK_IN_USE = CRONOS_MAINNET_RPC;

if (!NETWORK_IN_USE) {
  throw new Error('Network RPC not set');
}

const RPC_PROVIDER = new ethers.providers.JsonRpcProvider(NETWORK_IN_USE);

const adminAddress = {
  managerAddress: process.env.AEGIS_MANAGER_ADDRESS!
};

const adminKeys = {
  managerKey: process.env.AEGIS_MANAGER_KEY!
};

export type LaunchpadProps = {
  want: string;
  wantDecimals: number;
  offerDecimals: number;
  offer: string;
  start: number;
  end: number;
  admin: string;
  collectingEth: string;
  offeredEth: string;
};

export type SetMinterProps = {
  minter: string;
  contractAddress: string;
};

export type RemoveMinterProps = {
  minter: string;
  contractAddress: string;
};

export type MintableAegisERC20WithFixedTotalSupplyProps = {
  minter?: string;
  maxSupplyEth: string;
  initialSupplyEth: string;
  name: string;
  symbol: string;
};

export type MintProps = {
  amountEth: string;
  contractAddress: string;
};

export type UpdateLendingAllowedTransfererProps = {
  transferer: string;
  contractAddress: string;
};

export type GiveAllowanceErc20Props = {
  key: string;
  contractAddress: string;
  dest: string;
};

export type AegisNFTDivineAnvilsProps = {
  want: string;
  treasury: string;
  maxSupply: number;
};

export type AegisNFTAtlantisPassProps = {
  want: string;
  treasury: string;
  maxSupply: number;
  mintPrice: number;
};

export type AegisVaultDeploymentProps = {
  want: string;
  output: string;
  poolId: number;
  farm: string;
  dexrouter: string;
  manager: string;
  treasury: string;
  harvestOnDeposit: boolean;
  outputToL0Route: string[];
  l0ToL1Route: string[];
};

export type LotteryDeploymentProps = {
  addressInitializer: {
    prizePoolAddress: string;
    lpPoolPrizeAddress: string;
  };
  tokenInitializer: {
    want: string;
    prize: string;
    tPrize: string;
    lpPrize: string;
  };
  winningAmountInitializer: {
    firstTierWinningRewardAmountPrize: string;
    firstTierWinningRewardAmountTPrize: string;
    secondTierWinningRewardAmountPrize: string;
    secondTierWinningRewardAmountTPrize: string;
    thirdTierWinningRewardAmount: string;
  };
  treasury: string;
  ticketPrice: string;
};

export type AegisRouterOracleProps = {
  router: string;
  factory: string;
  targetUsd: string;
  targetUsdDecimals: number;
};

export type UpdateAegisOracleRouterProps = {
  newRouter: string;
  contractAddress: string;
};

export type UpdateAegisOracleFactoryProps = {
  newFactory: string;
  contractAddress: string;
};

export type UpdateAegisOracleTargetUsdProps = {
  newTargetUsd: string;
  newDecimals: number;
  contractAddress: string;
};

export type AegisOracleSetQuotePathElement = {
  addr: string;
  decimals: number;
};

export type AegisOracleSetQuoteProps = {
  token: string;
  path: AegisOracleSetQuotePathElement[];
  contractAddress: string;
};

export type AegisOracleSetLpQuoteProps = {
  lpToken: string;
  contractAddress: string;
};

export type AegisLendingProps = {
  borrower: string;
  startBlock: number;
  ethOracleAddress: string;
  wethAddress: string;
  collateralNum: number;
  collateralDen: number;
};

export type AegisLendingTokenProps = {
  minter: string;
  initialSupplyNotWei: number;
  allowedTransferer: string;
  name: string;
  symbol: string;
};

export type AegisLendingAddNewMarketProps = {
  contract: string;
  marketAddress: string;
  receiptAddress: string;
};

export type AegisLendingSetRouterOracleProps = {
  contract: string;
  marketAddress: string;
  oracleAddress: string;
};

export type AegisLendingAddPoolReward = {
  contract: string;
  rewardAddress: string;
  rewardsPerBlockNotWei: string;
};

type PoolProps = {
  contract: string;
  rewardAddress: string;
  allocationPoints: number;
  withUpdate: boolean;
};

export type AegisLendingAddPool = PoolProps & {
  wantAddress: string;
};

export type AegisLendingEthAddPool = PoolProps;

export type Strat = 'AegisStrat';

export type LaunchpadFinalWithdrawProps = {
  wantAmountEth: string;
  soldAmountEth: string;
  wantDecimals: number;
  soldDecimals: number;
  contractAddress: string;
};

export type LaunchpadUpdateStartEndBLockProps = {
  startBlock: number;
  endBlock: number;
  contractAddress: string;
};

export async function deployMintableToken(
  minter: string,
  initialSupply: number,
  name: string,
  symbol: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying MintableAegisERC20 contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('MintableAegisERC20');
  const deployedContract = await ContractSource.deploy(
    initialSupply,
    name,
    symbol
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  await deployedContract.setMinter(minter);
  console.log('✅ Set minter');

  return deployedContract.address;
}

export async function deployMintableTokenWithFixedMaxSupply(
  props: MintableAegisERC20WithFixedTotalSupplyProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying MintableAegisERC20 contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    'MintableAegisERC20WithFixedTotalSupply'
  );
  const deployedContract = await ContractSource.deploy(
    ethers.utils.parseEther(props.initialSupplyEth),
    ethers.utils.parseEther(props.maxSupplyEth),
    props.name,
    props.symbol
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  if (props.minter) {
    await deployedContract.setMinter(props.minter);
    console.log('✅ Set minter');
  }

  return deployedContract.address;
}

export async function deployFixedSupplyToken(
  totalSupply: number,
  name: string,
  symbol: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying FixedSupplyAegisERC20 contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    'FixedSupplyAegisERC20'
  );
  const deployedContract = await ContractSource.deploy(
    totalSupply,
    name,
    symbol
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deploySixDecimalsUsd(supply: number): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying SixDecimalsUsd contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('SixDecimalsUsd');
  const deployedContract = await ContractSource.deploy(supply, 'Usd', 'USD');

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deployFarm(
  devAddress: string,
  startingBlock: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying AegisFarm contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisFarm');
  const deployedContract = await ContractSource.deploy(
    devAddress,
    startingBlock
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deployVaultWithStrat(
  strat: Strat,
  props: AegisVaultDeploymentProps
): Promise<{ vault: string; strat: string }> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying AegisVault with',
    strat,
    'with address:',
    deployer.address
  );

  const AegisStratFactoryInstance = await ethers.getContractFactory(strat);
  const AegisVaultFactoryInstance = await ethers.getContractFactory(
    'AegisVault'
  );

  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  let ret: { vault: string; strat: string } = {
    vault: '',
    strat: ''
  };

  const deployedAegisVaultContract = await upgrades.deployProxy(
    AegisVaultFactoryInstance,
    [
      '0x0000000000000000000000000000000000000000',
      adminAddress.managerAddress,
      'AEGV',
      'Aegis Vault'
    ]
  );
  await deployedAegisVaultContract.deployed();
  console.log(
    '😎 AegisVault contract with',
    strat,
    'at:',
    deployedAegisVaultContract.address
  );

  const deployedAegisStratContract = await AegisStratFactoryInstance.deploy(
    props.want,
    props.output,
    props.poolId,
    props.farm,
    deployedAegisVaultContract.address,
    props.dexrouter,
    props.manager,
    props.treasury,
    props.harvestOnDeposit,
    props.outputToL0Route,
    props.l0ToL1Route
  );
  await deployedAegisStratContract.deployed();
  console.log('😎 AegisStrat contract at:', deployedAegisStratContract.address);

  const connectedAegisStrat =
    deployedAegisStratContract.connect(managerWalletSigner);
  await connectedAegisStrat.giveAllowances();
  console.log('😎 Given allowances');

  const vault = new ethers.Contract(
    deployedAegisVaultContract.address,
    vaultAbi.abi,
    managerWalletSigner
  );
  await vault
    .connect(managerWalletSigner)
    .upgradeStrat(deployedAegisStratContract.address);
  console.log('😎 Set the strategy address');

  ret.vault = deployedAegisVaultContract.address;
  ret.strat = deployedAegisStratContract.address;
  return ret;
}

export async function deployLottery(
  props: LotteryDeploymentProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying AegisLottery contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisLottery');
  const deployedContract = await upgrades.deployProxy(ContractSource, [
    [
      props.addressInitializer.prizePoolAddress,
      props.addressInitializer.lpPoolPrizeAddress
    ],
    [
      props.tokenInitializer.want,
      props.tokenInitializer.prize,
      props.tokenInitializer.tPrize,
      props.tokenInitializer.lpPrize
    ],
    [
      ethers.utils.parseEther(
        props.winningAmountInitializer.firstTierWinningRewardAmountPrize
      ),
      ethers.utils.parseEther(
        props.winningAmountInitializer.firstTierWinningRewardAmountTPrize
      ),
      ethers.utils.parseEther(
        props.winningAmountInitializer.secondTierWinningRewardAmountPrize
      ),
      ethers.utils.parseEther(
        props.winningAmountInitializer.secondTierWinningRewardAmountTPrize
      ),
      ethers.utils.parseEther(
        props.winningAmountInitializer.thirdTierWinningRewardAmount
      )
    ],
    props.treasury,
    ethers.utils.parseEther(props.ticketPrice)
  ]);
  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function upgradeLottery(proxy: string): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log('ℹ️  Upgrading Lottery contract with address:', deployer.address);

  const ContractSource = await ethers.getContractFactory('Lottery');
  const deployedContract = await upgrades.upgradeProxy(proxy, ContractSource);
  await deployedContract.deployed();

  console.log('😎 Contract upgraded at:', deployedContract.address);
  console.log('✅ Upgrade passed ');

  return deployedContract.address;
}

export async function giveAllowanceERC20(
  props: GiveAllowanceErc20Props
): Promise<void> {
  const MAX_APPROVAL =
    '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  const wallet = new ethers.Wallet(props.key, RPC_PROVIDER);
  const walletSigner = wallet.connect(RPC_PROVIDER);

  const contract = new ethers.Contract(
    props.contractAddress,
    erc20abi.abi,
    walletSigner
  );
  const tx = await contract
    .connect(walletSigner)
    .approve(props.dest, MAX_APPROVAL);
  await tx.wait();

  console.log('✅ Given approval');
}

export async function deployNFTAegisDivineAnvils(
  props: AegisNFTDivineAnvilsProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying NFT Aegis Divine Anvils contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisDivineAnvils');
  const deployedContract = await upgrades.deployProxy(ContractSource, [
    props.want,
    props.treasury,
    props.maxSupply
  ]);
  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deployNFTAegisAtlantisPass(
  props: AegisNFTAtlantisPassProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying NFT Aegis Atlantis Pass contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisAtlantisPass');
  const deployedContract = await upgrades.deployProxy(ContractSource, [
    props.want,
    props.treasury,
    props.maxSupply,
    props.mintPrice
  ]);
  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deployCroPriceOracle(): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying CroPriceOracle contract with address:',
    deployer.address
  );

  const CRO_MAINNET_PYTH_CONTRACT_ADDRESS =
    '0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B';
  const ContractSource = await ethers.getContractFactory('CroPriceOracle');
  const deployedContract = await ContractSource.deploy(
    CRO_MAINNET_PYTH_CONTRACT_ADDRESS
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  const price = await deployedContract.getPrice(
    ethers.utils.parseEther('1'),
    18,
    20
  );
  console.log('Oracle price:', price);

  return deployedContract.address;
}

export async function deployCroPriceOracleTestnet(): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying CroPriceOracle contract with address:',
    deployer.address
  );

  const CRO_TESTNET_PYTH_CONTRACT_ADDRESS =
    '0xBAEA4A1A2Eaa4E9bb78f2303C213Da152933170E';
  const ContractSource = await ethers.getContractFactory(
    'CroPriceOracleTestnet'
  );
  const deployedContract = await ContractSource.deploy(
    CRO_TESTNET_PYTH_CONTRACT_ADDRESS
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  const price = await deployedContract.getPrice(
    ethers.utils.parseEther('1'),
    18,
    20
  );
  console.log('Oracle price:', price);

  return deployedContract.address;
}

export async function deployAegisRouterOracle(
  props: AegisRouterOracleProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying Aegis Router Oracle contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisRouterOracle');
  const deployedContract = await upgrades.deployProxy(ContractSource, [
    props.router,
    props.factory,
    props.targetUsd,
    props.targetUsdDecimals
  ]);
  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function updateAegisOracleRouter(
  props: UpdateAegisOracleRouterProps
): Promise<void> {
  const contract = new ethers.Contract(
    props.contractAddress,
    aegisRouterOracleAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .updateRouter(props.newRouter);
  const receipt = await tx.wait();

  console.log('😎 Oracle router updated at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function updateAegisOracleFactory(
  props: UpdateAegisOracleFactoryProps
): Promise<void> {
  const contract = new ethers.Contract(
    props.contractAddress,
    aegisRouterOracleAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .updateFactory(props.newFactory);
  const receipt = await tx.wait();

  console.log('😎 Oracle factory updated at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function updateAegisOracleTargetUsd(
  props: UpdateAegisOracleTargetUsdProps
): Promise<void> {
  const contract = new ethers.Contract(
    props.contractAddress,
    aegisRouterOracleAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .updateTargetUsd(props.newTargetUsd, props.newDecimals);
  const receipt = await tx.wait();

  console.log('😎 Oracle target usd updated at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisOracleSetQuote(
  props: AegisOracleSetQuoteProps
): Promise<void> {
  const contract = new ethers.Contract(
    props.contractAddress,
    aegisRouterOracleAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .setQuote(props.token, props.path);
  const receipt = await tx.wait();

  console.log('😎 Oracle quote set at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisOracleSetLpQuote(
  props: AegisOracleSetLpQuoteProps
): Promise<void> {
  const contract = new ethers.Contract(
    props.contractAddress,
    aegisRouterOracleAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .setLpQuote(props.lpToken);
  const receipt = await tx.wait();

  console.log('😎 Oracle lp quote set at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function deployAegisLending(
  props: AegisLendingProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying Aegis Lending contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisLending');
  const deployedContract = await upgrades.deployProxy(ContractSource, [
    props.borrower,
    props.startBlock,
    props.ethOracleAddress,
    props.wethAddress,
    props.collateralNum,
    props.collateralDen
  ]);
  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed ');

  return deployedContract.address;
}

export async function deployAegisLendingToken(
  props: AegisLendingTokenProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'ℹ️  Deploying AegisLendingToken contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisLendingToken');
  const deployedContract = await ContractSource.deploy(
    props.initialSupplyNotWei,
    props.allowedTransferer,
    props.name,
    props.symbol
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  if (props.minter) {
    await deployedContract.setMinter(props.minter);
    console.log('✅ Set minter');
  }

  return deployedContract.address;
}

export async function aegisLendingAddNewMarket(
  props: AegisLendingAddNewMarketProps
): Promise<void> {
  console.log('ℹ️  Adding new market to AegisLending', props);

  const contract = new ethers.Contract(
    props.contract,
    aegisLendingAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .addNewMarket(props.marketAddress, props.receiptAddress);
  const receipt = await tx.wait();

  console.log('😎 New market added at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisLendingSetRouterOracle(
  props: AegisLendingSetRouterOracleProps
): Promise<void> {
  console.log('ℹ️  Setting router oracle for AegisLending', props);

  const contract = new ethers.Contract(
    props.contract,
    aegisLendingAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .setRouterOracle(props.marketAddress, props.oracleAddress);
  const receipt = await tx.wait();

  console.log('😎 New oracle set at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisLendingAddPoolReward(
  props: AegisLendingAddPoolReward
): Promise<void> {
  console.log('ℹ️  Adding pool reward for AegisLending', props);

  const contract = new ethers.Contract(
    props.contract,
    aegisLendingAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .setReward(
      props.rewardAddress,
      ethers.utils.parseEther(props.rewardsPerBlockNotWei)
    );
  const receipt = await tx.wait();

  console.log('😎 Reward added to pool at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisLendingAddPool(
  props: AegisLendingAddPool
): Promise<void> {
  console.log('ℹ️  Adding pool for AegisLending', props);

  const contract = new ethers.Contract(
    props.contract,
    aegisLendingAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .addPool(
      props.wantAddress,
      props.rewardAddress,
      props.allocationPoints,
      props.withUpdate
    );
  const receipt = await tx.wait();

  console.log('😎 Added to pool at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function aegisLendingAddEthPool(
  props: AegisLendingAddPool
): Promise<void> {
  console.log('ℹ️  Adding eth pool for AegisLending', props);

  const contract = new ethers.Contract(
    props.contract,
    aegisLendingAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .addPoolEth(props.rewardAddress, props.allocationPoints, props.withUpdate);
  const receipt = await tx.wait();

  console.log('😎 Added eth to pool at:', receipt.transactionHash);
  console.log('✅ Operation passed');
}

export async function upgradeAegisLending(proxy: string): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log('ℹ️  Upgrading Lending contract with address:', deployer.address);

  const ContractSource = await ethers.getContractFactory('AegisLending');
  const deployedContract = await upgrades.upgradeProxy(proxy, ContractSource);
  await deployedContract.deployed();

  console.log('😎 Contract upgraded at:', deployedContract.address);
  console.log('✅ Upgrade passed ');

  return deployedContract.address;
}

export async function setMinter(props: SetMinterProps) {
  const contract = new ethers.Contract(
    props.contractAddress,
    mintableErc20abi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .setMinter(props.minter);
  await tx.wait();

  console.log('✅ Minter set');
}

export async function removeMinter(props: RemoveMinterProps) {
  const contract = new ethers.Contract(
    props.contractAddress,
    mintableErc20abi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .removeMinter(props.minter);
  await tx.wait();

  console.log('✅ Minter removed');
}

export async function mint(props: MintProps) {
  const contract = new ethers.Contract(
    props.contractAddress,
    mintableErc20abi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .mint(ethers.utils.parseEther(props.amountEth));
  await tx.wait();

  console.log('✅ Minted', props.amountEth, 'to', managerWallet.address);
}

export async function updateLendingTokenTransferer(
  props: UpdateLendingAllowedTransfererProps
) {
  const contract = new ethers.Contract(
    props.contractAddress,
    mintableLendingErc20abi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .updateAllowedTransferer(props.transferer);
  await tx.wait();

  console.log('✅ Updated transferer');
}

export default async function deployLaunchpad(
  deploymentProps: LaunchpadProps
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'Deploying HellsKitchen contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('AegisLaunchpad');
  const deployedContract = await ContractSource.deploy(
    deploymentProps.want,
    deploymentProps.offer,
    deploymentProps.start,
    deploymentProps.end,
    0,
    deploymentProps.admin
  );

  await deployedContract.deployed();

  console.log('😎 Contract deployed at:', deployedContract.address);
  console.log('✅ Deployment passed');

  //set the pool
  let tx = await deployedContract.setPool(
    ethers.utils.parseUnits(
      deploymentProps.offeredEth,
      deploymentProps.offerDecimals
    ),
    ethers.utils.parseUnits(
      deploymentProps.collectingEth,
      deploymentProps.wantDecimals
    ),
    0,
    false
  );
  await tx.wait();
  console.log('✅ Launchpad pool set, remember to fund the launchpad!');

  return deployedContract.address;
}

export async function launchpadFinalWithdraw(
  props: LaunchpadFinalWithdrawProps
) {
  const contract = new ethers.Contract(
    props.contractAddress,
    launchpadAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .finalWithdraw(
      ethers.utils.parseUnits(props.wantAmountEth, props.wantDecimals),
      ethers.utils.parseUnits(props.soldAmountEth, props.soldDecimals)
    );
  await tx.wait();

  console.log('✅ Launchpad collected');
}

export async function launchpadUpdateStartAndEndBlocks(
  props: LaunchpadUpdateStartEndBLockProps
) {
  const contract = new ethers.Contract(
    props.contractAddress,
    launchpadAbi.abi,
    RPC_PROVIDER
  );
  const managerWallet = new ethers.Wallet(adminKeys.managerKey, RPC_PROVIDER);
  const managerWalletSigner = managerWallet.connect(RPC_PROVIDER);

  const tx = await contract
    .connect(managerWalletSigner)
    .updateStartAndEndBlocks(props.startBlock, props.endBlock);
  await tx.wait();

  console.log('✅ Launchpad updated');
}
