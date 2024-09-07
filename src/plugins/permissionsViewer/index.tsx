/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import {
    findGroupChildrenByChildId,
    NavContextMenuPatchCallback,
} from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { SafetyIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    Button,
    ChannelStore,
    Dialog,
    GuildMemberStore,
    GuildStore,
    match,
    Menu,
    PermissionsBits,
    Popout,
    TooltipContainer,
    UserStore,
} from "@webpack/common";
import type { Guild, GuildMember } from "discord-types/general";

import openRolesAndUsersPermissionsModal, {
    PermissionType,
    RoleOrUserPermission,
} from "./components/RolesAndUsersPermissions";
import UserPermissions from "./components/UserPermissions";
import { getSortedRoles, sortPermissionOverwrites } from "./utils";

const PopoutClasses = findByPropsLazy("container", "scroller", "list");
const RoleButtonClasses = findByPropsLazy(
    "button",
    "buttonInner",
    "icon",
    "banner"
);

export const enum PermissionsSortOrder {
    HighestRole,
    LowestRole,
}

const enum MenuItemParentType {
    User,
    Channel,
    Guild,
}

export const settings = definePluginSettings({
    permissionsSortOrder: {
        description:
            "The sort method used for defining which role grants an user a certain permission",
        type: OptionType.SELECT,
        options: [
            {
                label: "Highest Role",
                value: PermissionsSortOrder.HighestRole,
                default: true,
            },
            { label: "Lowest Role", value: PermissionsSortOrder.LowestRole },
        ],
    },
    defaultPermissionsDropdownState: {
        description:
            "Whether the permissions dropdown on user popouts should be open by default",
        type: OptionType.BOOLEAN,
        default: false,
    },
});

function MenuItem(guildId: string, id?: string, type?: MenuItemParentType) {
    if (
        type === MenuItemParentType.User &&
        !GuildMemberStore.isMember(guildId, id!)
    )
        return null;

    return (
        <Menu.MenuItem
            id="perm-viewer-permissions"
            label="Permissions"
            action={() => {
                const guild = GuildStore.getGuild(guildId);

                const { permissions, header } = match(type)
                    .returnType<{
                        permissions: RoleOrUserPermission[];
                        header: string;
                    }>()
                    .with(MenuItemParentType.User, () => {
                        const member = GuildMemberStore.getMember(guildId, id!);

                        const permissions: RoleOrUserPermission[] =
                            getSortedRoles(guild, member).map((role) => ({
                                type: PermissionType.Role,
                                ...role,
                            }));

                        if (guild.ownerId === id) {
                            permissions.push({
                                type: PermissionType.Owner,
                                permissions: Object.values(
                                    PermissionsBits
                                ).reduce((prev, curr) => prev | curr, 0n),
                            });
                        }

                        return {
                            permissions,
                            header:
                                member.nick ??
                                UserStore.getUser(member.userId).username,
                        };
                    })
                    .with(MenuItemParentType.Channel, () => {
                        const channel = ChannelStore.getChannel(id!);

                        const permissions = sortPermissionOverwrites(
                            Object.values(channel.permissionOverwrites).map(
                                ({ id, allow, deny, type }) => ({
                                    type: type as PermissionType,
                                    id,
                                    overwriteAllow: allow,
                                    overwriteDeny: deny,
                                })
                            ),
                            guildId
                        );

                        return {
                            permissions,
                            header: channel.name,
                        };
                    })
                    .otherwise(() => {
                        const permissions = Object.values(
                            GuildStore.getRoles(guild.id)
                        ).map((role) => ({
                            type: PermissionType.Role,
                            ...role,
                        }));

                        return {
                            permissions,
                            header: guild.name,
                        };
                    });

                openRolesAndUsersPermissionsModal(permissions, guild, header);
            }}
        />
    );
}

function makeContextMenuPatch(
    childId: string | string[],
    type?: MenuItemParentType
): NavContextMenuPatchCallback {
    return (children, props) => {
        if (
            !props ||
            (type === MenuItemParentType.User && !props.user) ||
            (type === MenuItemParentType.Guild && !props.guild) ||
            (type === MenuItemParentType.Channel &&
                (!props.channel || !props.guild))
        ) {
            return;
        }

        const group = findGroupChildrenByChildId(childId, children);

        const item = match(type)
            .with(MenuItemParentType.User, () =>
                MenuItem(props.guildId, props.user.id, type)
            )
            .with(MenuItemParentType.Channel, () =>
                MenuItem(props.guild.id, props.channel.id, type)
            )
            .with(MenuItemParentType.Guild, () => MenuItem(props.guild.id))
            .otherwise(() => null);

        if (item == null) return;

        if (group) {
            return group.push(item);
        }

        // "roles" may not be present due to the member not having any roles. In that case, add it above "Copy ID"
        if (childId === "roles" && props.guildId) {
            children.splice(-1, 0, <Menu.MenuGroup>{item}</Menu.MenuGroup>);
        }
    };
}

export default definePlugin({
    name: "PermissionsViewer",
    description:
        "View the permissions a user or channel has, and the roles of a server",
    authors: [Devs.Nuckyz, Devs.Ven],
    settings,

    patches: [
        {
            find: ".VIEW_ALL_ROLES,",
            replacement: {
                match: /\.collapseButton,.+?}\)}\),/,
                replace: "$&$self.ViewPermissionsButton(arguments[0]),",
            },
        },
    ],

    ViewPermissionsButton: ErrorBoundary.wrap(
        ({
            guild,
            guildMember,
        }: {
            guild: Guild;
            guildMember: GuildMember;
        }) => (
            <Popout
                position="bottom"
                align="center"
                renderPopout={() => (
                    <Dialog
                        className={PopoutClasses.container}
                        style={{ width: "500px" }}
                    >
                        <UserPermissions
                            guild={guild}
                            guildMember={guildMember}
                            forceOpen
                        />
                    </Dialog>
                )}
            >
                {(popoutProps) => (
                    <TooltipContainer text="View Permissions">
                        <Button
                            {...popoutProps}
                            color={Button.Colors.CUSTOM}
                            look={Button.Looks.FILLED}
                            size={Button.Sizes.NONE}
                            innerClassName={classes(
                                RoleButtonClasses.buttonInner,
                                RoleButtonClasses.icon
                            )}
                            className={classes(
                                RoleButtonClasses.button,
                                RoleButtonClasses.icon,
                                "vc-permviewer-role-button"
                            )}
                        >
                            <SafetyIcon height="16" width="16" />
                        </Button>
                    </TooltipContainer>
                )}
            </Popout>
        ),
        { noop: true }
    ),

    contextMenus: {
        "user-context": makeContextMenuPatch("roles", MenuItemParentType.User),
        "channel-context": makeContextMenuPatch(
            ["mute-channel", "unmute-channel"],
            MenuItemParentType.Channel
        ),
        "guild-context": makeContextMenuPatch(
            "privacy",
            MenuItemParentType.Guild
        ),
        "guild-header-popout": makeContextMenuPatch(
            "privacy",
            MenuItemParentType.Guild
        ),
    },
});
