module pacific_avatar::avatar;

use sui::coin::{Self as coin, Coin};
use std::string::{Self as string, String};
use std::type_name;
use sui::sui::SUI;
use sui::display;
use sui::dynamic_object_field as dof;
use sui::event;
use sui::package;

const E_CHILD_SLOT_EXISTS: u64 = 0;
const E_CHILD_SLOT_DOES_NOT_EXIST: u64 = 1;
const E_MINT_REQUIRES_PAYMENT: u64 = 2;
const E_INVALID_MINT_PAYMENT: u64 = 3;
const E_UNAUTHORIZED_PUBLISHER: u64 = 4;

const MINT_PRICE_MIST: u64 = 5_000_000_000;

public struct AVATAR has drop {}

public struct MintAdminCap has key, store {
    id: UID,
}

public struct MintConfig has key, store {
    id: UID,
    treasury: address,
    mint_price_mist: u64,
}

public struct Avatar has key, store {
    id: UID,
    name: String,
    description: String,
    display_description: String,
    manifest_blob_id: String,
    preview_blob_id: String,
    preview_url: String,
    project_url: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
}

public struct AvatarChildSlot has copy, drop, store {
    name: String,
}

public struct AvatarMinted has copy, drop {
    avatar_id: address,
    owner: address,
    manifest_blob_id: String,
    preview_blob_id: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
}

public struct AvatarUpdated has copy, drop {
    avatar_id: address,
    owner: address,
    manifest_blob_id: String,
    preview_blob_id: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
}

public struct AvatarChildAttached has copy, drop {
    avatar_id: address,
    owner: address,
    child_object_id: address,
    field_name: String,
    child_type: String,
}

public struct AvatarChildDetached has copy, drop {
    avatar_id: address,
    owner: address,
    child_object_id: address,
    field_name: String,
    child_type: String,
}

public struct MintConfigCreated has copy, drop {
    mint_config_id: address,
    treasury: address,
    mint_price_mist: u64,
}

public struct MintConfigUpdated has copy, drop {
    mint_config_id: address,
    treasury: address,
    mint_price_mist: u64,
}

fun init(witness: AVATAR, ctx: &mut TxContext) {
    let owner = ctx.sender();
    let publisher = package::claim(witness, ctx);
    let mut avatar_display = display::new_with_fields<Avatar>(
        &publisher,
        vector[
            string::utf8(b"name"),
            string::utf8(b"description"),
            string::utf8(b"image"),
            string::utf8(b"image_url"),
            string::utf8(b"thumbnail_url"),
            string::utf8(b"link"),
        ],
        vector[
            string::utf8(b"{name}"),
            string::utf8(b"{display_description}"),
            string::utf8(b"{preview_url}"),
            string::utf8(b"{preview_url}"),
            string::utf8(b"{preview_url}"),
            string::utf8(b"{project_url}"),
        ],
        ctx,
    );

    display::update_version(&mut avatar_display);
    transfer::public_share_object(avatar_display);
    create_mint_admin_objects(owner, ctx);
    publisher.burn();
}

fun create_mint_admin_objects(owner: address, ctx: &mut TxContext) {
    let mint_config = MintConfig {
        id: object::new(ctx),
        treasury: owner,
        mint_price_mist: MINT_PRICE_MIST,
    };
    let mint_admin_cap = MintAdminCap {
        id: object::new(ctx),
    };

    event::emit(MintConfigCreated {
        mint_config_id: object::id(&mint_config).to_address(),
        treasury: mint_config.treasury,
        mint_price_mist: mint_config.mint_price_mist,
    });

    transfer::public_share_object(mint_config);
    transfer::public_transfer(mint_admin_cap, owner);
}

public fun bootstrap_mint_config(
    publisher: package::Publisher,
    ctx: &mut TxContext,
) {
    assert!(package::from_package<Avatar>(&publisher), E_UNAUTHORIZED_PUBLISHER);
    create_mint_admin_objects(ctx.sender(), ctx);
    publisher.burn();
}

public fun mint(
    _name: String,
    _description: String,
    _display_description: String,
    _manifest_blob_id: String,
    _preview_blob_id: String,
    _preview_url: String,
    _project_url: String,
    _wins: u64,
    _losses: u64,
    _hp: u64,
    _schema_version: u64,
    _ctx: &mut TxContext,
) {
    abort E_MINT_REQUIRES_PAYMENT
}

public fun mint_paid(
    mint_config: &MintConfig,
    payment: Coin<SUI>,
    name: String,
    description: String,
    display_description: String,
    manifest_blob_id: String,
    preview_blob_id: String,
    preview_url: String,
    project_url: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
    ctx: &mut TxContext,
) {
    let owner = ctx.sender();
    assert!(coin::value(&payment) == mint_config.mint_price_mist, E_INVALID_MINT_PAYMENT);
    transfer::public_transfer(payment, mint_config.treasury);
    mint_avatar(
        owner,
        name,
        description,
        display_description,
        manifest_blob_id,
        preview_blob_id,
        preview_url,
        project_url,
        wins,
        losses,
        hp,
        schema_version,
        ctx,
    );
}

fun mint_avatar(
    owner: address,
    name: String,
    description: String,
    display_description: String,
    manifest_blob_id: String,
    preview_blob_id: String,
    preview_url: String,
    project_url: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
    ctx: &mut TxContext,
) {
    let avatar = Avatar {
        id: object::new(ctx),
        name,
        description,
        display_description,
        manifest_blob_id,
        preview_blob_id,
        preview_url,
        project_url,
        wins,
        losses,
        hp,
        schema_version,
    };

    event::emit(AvatarMinted {
        avatar_id: object::id(&avatar).to_address(),
        owner,
        manifest_blob_id: avatar.manifest_blob_id,
        preview_blob_id: avatar.preview_blob_id,
        wins: avatar.wins,
        losses: avatar.losses,
        hp: avatar.hp,
        schema_version: avatar.schema_version,
    });

    transfer::public_transfer(avatar, owner);
}

public fun update_mint_config(
    _mint_admin_cap: &MintAdminCap,
    mint_config: &mut MintConfig,
    treasury: address,
    mint_price_mist: u64,
) {
    mint_config.treasury = treasury;
    mint_config.mint_price_mist = mint_price_mist;

    event::emit(MintConfigUpdated {
        mint_config_id: object::id(mint_config).to_address(),
        treasury: mint_config.treasury,
        mint_price_mist: mint_config.mint_price_mist,
    });
}

public fun update(
    avatar: &mut Avatar,
    name: String,
    description: String,
    display_description: String,
    manifest_blob_id: String,
    preview_blob_id: String,
    preview_url: String,
    project_url: String,
    wins: u64,
    losses: u64,
    hp: u64,
    schema_version: u64,
    ctx: &TxContext,
) {
    avatar.name = name;
    avatar.description = description;
    avatar.display_description = display_description;
    avatar.manifest_blob_id = manifest_blob_id;
    avatar.preview_blob_id = preview_blob_id;
    avatar.preview_url = preview_url;
    avatar.project_url = project_url;
    avatar.wins = wins;
    avatar.losses = losses;
    avatar.hp = hp;
    avatar.schema_version = schema_version;

    event::emit(AvatarUpdated {
        avatar_id: object::id(avatar).to_address(),
        owner: ctx.sender(),
        manifest_blob_id: avatar.manifest_blob_id,
        preview_blob_id: avatar.preview_blob_id,
        wins: avatar.wins,
        losses: avatar.losses,
        hp: avatar.hp,
        schema_version: avatar.schema_version,
    });
}

public fun attach_child<T: key + store>(
    avatar: &mut Avatar,
    field_name: String,
    child: T,
    ctx: &TxContext,
) {
    let slot = AvatarChildSlot { name: field_name };
    assert!(!dof::exists_(&avatar.id, slot), E_CHILD_SLOT_EXISTS);

    let child_id = object::id(&child);
    let child_type = string::utf8(type_name::with_original_ids<T>().into_string().into_bytes());
    dof::add(&mut avatar.id, slot, child);

    event::emit(AvatarChildAttached {
        avatar_id: object::id(avatar).to_address(),
        owner: ctx.sender(),
        child_object_id: child_id.to_address(),
        field_name: slot.name,
        child_type,
    });
}

public fun detach_child<T: key + store>(
    avatar: &mut Avatar,
    field_name: String,
    recipient: address,
    ctx: &TxContext,
) {
    let slot = AvatarChildSlot { name: field_name };
    assert!(dof::exists_with_type<AvatarChildSlot, T>(&avatar.id, slot), E_CHILD_SLOT_DOES_NOT_EXIST);

    let child = dof::remove<AvatarChildSlot, T>(&mut avatar.id, slot);
    let child_id = object::id(&child);
    let child_type = string::utf8(type_name::with_original_ids<T>().into_string().into_bytes());

    event::emit(AvatarChildDetached {
        avatar_id: object::id(avatar).to_address(),
        owner: ctx.sender(),
        child_object_id: child_id.to_address(),
        field_name: slot.name,
        child_type,
    });

    transfer::public_transfer(child, recipient);
}

public fun manifest_blob_id(avatar: &Avatar): &String {
    &avatar.manifest_blob_id
}

public fun preview_blob_id(avatar: &Avatar): &String {
    &avatar.preview_blob_id
}

public fun preview_url(avatar: &Avatar): &String {
    &avatar.preview_url
}

public fun project_url(avatar: &Avatar): &String {
    &avatar.project_url
}

public fun schema_version(avatar: &Avatar): u64 {
    avatar.schema_version
}

public fun wins(avatar: &Avatar): u64 {
    avatar.wins
}

public fun losses(avatar: &Avatar): u64 {
    avatar.losses
}

public fun hp(avatar: &Avatar): u64 {
    avatar.hp
}

public fun treasury(mint_config: &MintConfig): address {
    mint_config.treasury
}

public fun mint_price_mist(mint_config: &MintConfig): u64 {
    mint_config.mint_price_mist
}
