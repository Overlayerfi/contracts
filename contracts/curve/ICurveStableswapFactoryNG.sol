// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICurveStableswapFactoryNG {
    // --- View Functions ---

    function pool_count() external view returns (uint256);
    function base_pool_count() external view returns (uint256);
    function get_base_pool(address pool) external view returns (address);
    function get_n_coins(address pool) external view returns (uint256);
    function get_meta_n_coins(
        address pool
    ) external view returns (uint256, uint256);
    function get_coins(address pool) external view returns (address[] memory);
    function get_underlying_coins(
        address pool
    ) external view returns (address[] memory);
    function get_decimals(
        address pool
    ) external view returns (uint256[] memory);
    function get_underlying_decimals(
        address pool
    ) external view returns (uint256[] memory);
    function get_metapool_rates(
        address pool
    ) external view returns (uint256[] memory);
    function get_balances(
        address pool
    ) external view returns (uint256[] memory);
    function get_underlying_balances(
        address pool
    ) external view returns (uint256[] memory);
    function get_A(address pool) external view returns (uint256);
    function get_fees(address pool) external view returns (uint256, uint256);
    function get_admin_balances(
        address pool
    ) external view returns (uint256[] memory);
    function get_coin_indices(
        address pool,
        address from,
        address to
    ) external view returns (int128, int128, bool);
    function get_gauge(address pool) external view returns (address);
    function get_implementation_address(
        address pool
    ) external view returns (address);
    function is_meta(address pool) external view returns (bool);
    function get_pool_asset_types(
        address pool
    ) external view returns (uint8[] memory);
    function find_pool_for_coins(
        address from,
        address to,
        uint256 i
    ) external view returns (address);
    function find_pool_for_coins(
        address from,
        address to
    ) external view returns (address);

    struct PlainPoolParams {
        string name;
        string symbol;
        address[] coins;
        uint256 A;
        uint256 fee;
        uint256 offpeg_fee_multiplier;
        uint256 ma_exp_time;
        uint256 implementation_idx;
        uint8[] asset_types;
        bytes4[] method_ids;
        address[] oracles;
    }

    // --- Deployment ---

    function deploy_plain_pool(
        string memory name,
        string memory symbol,
        address[] memory coins,
        uint256 A,
        uint256 fee,
        uint256 offpeg_fee_multiplier,
        uint256 ma_exp_time,
        uint256 implementation_idx,
        uint8[] memory asset_types,
        bytes4[] memory method_ids,
        address[] memory oracles
    ) external returns (address);
}
