// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ICurveStableswapFactoryNG.sol";

import "hardhat/console.sol";

contract CurvePoolDeployer {
    ICurveStableswapFactoryNG public curveFactory;

    error FactoryNotDeployed(address factory);
    error InvalidFactoryCode(address factory);

    constructor(address _factory) {
        require(_factory != address(0), "Invalid factory address");

        curveFactory = ICurveStableswapFactoryNG(_factory);
    }

    // --- Pool Deployment ---

    function deployPlainPool(
        ICurveStableswapFactoryNG.PlainPoolParams memory params
    ) external returns (address pool) {
        pool = curveFactory.deploy_plain_pool(
            params.name,
            params.symbol,
            params.coins,
            params.A,
            params.fee,
            params.offpeg_fee_multiplier,
            params.ma_exp_time,
            params.implementation_idx,
            params.asset_types,
            params.method_ids,
            params.oracles
        );
    }

    // --- View Functions ---

    function poolCount() external view returns (uint256) {
        return curveFactory.pool_count();
    }

    function basePoolCount() external view returns (uint256) {
        return curveFactory.base_pool_count();
    }

    function findPoolForCoins(
        address from,
        address to,
        uint256 i
    ) external view returns (address) {
        return curveFactory.find_pool_for_coins(from, to, i);
    }

    function findPoolForCoins(
        address from,
        address to
    ) external view returns (address) {
        return curveFactory.find_pool_for_coins(from, to);
    }

    function getBasePool(address pool) external view returns (address) {
        return curveFactory.get_base_pool(pool);
    }

    function getNCoins(address pool) external view returns (uint256) {
        return curveFactory.get_n_coins(pool);
    }

    function getMetaNCoins(
        address pool
    ) external view returns (uint256, uint256) {
        return curveFactory.get_meta_n_coins(pool);
    }

    function getCoins(address pool) external view returns (address[] memory) {
        return curveFactory.get_coins(pool);
    }

    function getUnderlyingCoins(
        address pool
    ) external view returns (address[] memory) {
        return curveFactory.get_underlying_coins(pool);
    }

    function getDecimals(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_decimals(pool);
    }

    function getUnderlyingDecimals(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_underlying_decimals(pool);
    }

    function getMetapoolRates(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_metapool_rates(pool);
    }

    function getBalances(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_balances(pool);
    }

    function getUnderlyingBalances(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_underlying_balances(pool);
    }

    function getA(address pool) external view returns (uint256) {
        return curveFactory.get_A(pool);
    }

    function getFees(address pool) external view returns (uint256, uint256) {
        return curveFactory.get_fees(pool);
    }

    function getAdminBalances(
        address pool
    ) external view returns (uint256[] memory) {
        return curveFactory.get_admin_balances(pool);
    }

    function getCoinIndices(
        address pool,
        address from,
        address to
    ) external view returns (int128, int128, bool) {
        return curveFactory.get_coin_indices(pool, from, to);
    }

    function getGauge(address pool) external view returns (address) {
        return curveFactory.get_gauge(pool);
    }

    function getImplementationAddress(
        address pool
    ) external view returns (address) {
        return curveFactory.get_implementation_address(pool);
    }

    function isMeta(address pool) external view returns (bool) {
        return curveFactory.is_meta(pool);
    }

    function getPoolAssetTypes(
        address pool
    ) external view returns (uint8[] memory) {
        return curveFactory.get_pool_asset_types(pool);
    }
}
