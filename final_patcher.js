const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'screens', 'CommunicationScreen.js');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

let changes = 0;
function patch(oldStr, newStr, label) {
    if (!content.includes(oldStr)) {
        console.log('⚠️ NOT FOUND:', label);
        return;
    }
    content = content.replace(oldStr, newStr);
    changes++;
    console.log('✅', label);
}

function regexPatch(regex, newStr, label) {
    if (!regex.test(content)) {
        console.log('⚠️ NOT FOUND:', label);
        return;
    }
    content = content.replace(regex, newStr);
    changes++;
    console.log('✅', label);
}

// 1. Imports
patch(
`import {
    createCommunicationTask,
    deleteCommunicationTask,
    deleteCommunicationTaskRemark,
    getCommunicationTasks,
    getCommunicationTeam,
    getCommunicationThreads,
    getConversationMessages,
    sendCommunicationMessage,
    updateCommunicationTask,
    updateCommunicationTaskRemark,
    updateCommunicationTaskStatus,
} from "../services/communicationService";`,
`import {
    createCommunicationTask,
    deleteCommunicationTask,
    deleteCommunicationTaskRemark,
    deleteCommunicationGroup,
    getCommunicationTasks,
    getCommunicationTeam,
    getCommunicationThreads,
    getConversationMessages,
    getGroupMessages,
    createCommunicationGroup,
    sendCommunicationMessage,
    updateCommunicationTask,
    updateCommunicationTaskRemark,
    updateCommunicationTaskStatus,
} from "../services/communicationService";`,
'1. Imports'
);

// 2. State variables
patch(
`    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);`,
`    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [groupCreateSuccess, setGroupCreateSuccess] = useState(false);
    const [groupCreating, setGroupCreating] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupMembers, setNewGroupMembers] = useState([]);
    const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);`,
'2. State variables'
);

patch(
`    const [selectedMemberId, setSelectedMemberId] = useState("");`,
`    const [selectedMemberId, setSelectedMemberId] = useState("");
    const [selectedIsGroup, setSelectedIsGroup] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState(null);`,
'2b. State variables'
);

// 3. groupedContacts
patch(
`    const groupedContacts = useMemo(
        () => ({
            admins: contactList.filter(
                (c) => String(c.member?.role || "").toLowerCase() === "admin",
            ),
            staff: contactList.filter(
                (c) => String(c.member?.role || "").toLowerCase() !== "admin",
            ),
        }),
        [contactList],
    );`,
`    const groupedContacts = useMemo(
        () => ({
            groups: contactList.filter((c) => c.isGroup === true),
            admins: contactList.filter(
                (c) => !c.isGroup && String(c.member?.role || "").toLowerCase() === "admin",
            ),
            staff: contactList.filter(
                (c) => !c.isGroup && String(c.member?.role || "").toLowerCase() !== "admin",
            ),
        }),
        [contactList],
    );`,
'3. groupedContacts'
);

// 4. loadOlder
patch(
`        try {
            const r = await getConversationMessages(memberId, {
                limit: MESSAGE_PAGE_SIZE,
                before: olderCursorBefore,
                beforeId: olderCursorBeforeId || undefined,
            });
            const older = uniqueMessages(r?.messages);`,
`        try {
            const r = selectedIsGroup
                ? await getGroupMessages(memberId, {
                    limit: MESSAGE_PAGE_SIZE,
                    before: olderCursorBefore,
                    beforeId: olderCursorBeforeId || undefined,
                })
                : await getConversationMessages(memberId, {
                    limit: MESSAGE_PAGE_SIZE,
                    before: olderCursorBefore,
                    beforeId: olderCursorBeforeId || undefined,
                });
            const older = uniqueMessages(r?.messages);`,
'4. loadOlder try block'
);
patch(
`        hasOlderMessages,
        olderCursorBefore,
        olderCursorBeforeId,
        selectedMemberId,
    ]);`,
`        hasOlderMessages,
        olderCursorBefore,
        olderCursorBeforeId,
        selectedMemberId,
        selectedIsGroup,
    ]);`,
'4b. loadOlder dependencies'
);

// 5. handleCreateGroup
patch(
`    const pickMessageImage = useCallback(`,
`    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            Alert.alert("Error", "Group name is required");
            return;
        }
        if (newGroupMembers.length === 0) {
            Alert.alert("Error", "Please select at least one member");
            return;
        }
        setGroupCreating(true);
        try {
            const res = await createCommunicationGroup({
                name: newGroupName,
                members: newGroupMembers,
            });
            setGroupCreateSuccess(true);
            const t = await getCommunicationThreads();
            setThreads(Array.isArray(t) ? t : []);
            setTimeout(async () => {
                setShowCreateGroupModal(false);
                setGroupCreateSuccess(false);
                setNewGroupName("");
                setNewGroupMembers([]);
                await openChat(res._id, true);
            }, 1200);
        } catch (e) {
            Alert.alert("Error", e?.response?.data?.error || "Failed to create group");
        } finally {
            setGroupCreating(false);
        }
    };

    const pickMessageImage = useCallback(`,
'5. handleCreateGroup'
);

// 6. Chat screen condition fixed
patch(
    'if (view === "chat" && selectedMember) {',
    'if (view === "chat" && (selectedMember || selectedIsGroup)) {',
    '6. Chat screen condition fixed'
);

// 7. roleLabel fixed for group
patch(
`        const roleLabel =
            String(selectedMember.role || "").toLowerCase() === "admin"
                ? adminRoleLabelMap[String(selectedMember._id)] || "Admin"
                : "Staff Member";`,
`        const roleLabel = selectedIsGroup
            ? \`\${(selectedGroup?.members?.length ?? 0)} members\`
            : String(selectedMember?.role || "").toLowerCase() === "admin"
                ? adminRoleLabelMap[String(selectedMember?._id)] || "Admin"
                : "Staff Member";`,
'7. roleLabel fixed for group'
);

// 8. Group sender name added
patch(
`            return (
                <View style={[S.msgRow, isMine ? S.msgRowOut : S.msgRowIn]}>
                    {!isMine && (
                        <InitialsAvatar
                            name={selectedMember?.name || "?"}
                            size={30}
                        />
                    )}
                    <View
                        style={[
                            S.msgBubble,
                            isMine ? S.msgBubbleOut : S.msgBubbleIn,
                        ]}>`,
`            const senderName = selectedIsGroup
                ? String(item?.senderId?.name || item?.senderId?.role || "Member")
                : null;
            return (
                <View style={[S.msgRow, isMine ? S.msgRowOut : S.msgRowIn]}>
                    {!isMine && (
                        <View style={{ alignItems: "center" }}>
                            <InitialsAvatar
                                name={selectedIsGroup
                                    ? String(item?.senderId?.name || selectedGroup?.name || "?")
                                    : selectedMember?.name || "?"}
                                size={30}
                            />
                        </View>
                    )}
                    <View style={S.msgBubbleWrap}>
                        {!isMine && senderName ? (
                            <Text style={S.groupSenderName}>{senderName}</Text>
                        ) : null}
                    <View
                        style={[
                            S.msgBubble,
                            isMine ? S.msgBubbleOut : S.msgBubbleIn,
                        ]}>`,
'8. Group sender name added'
);

// 9. msgBubbleWrap closed
regexPatch(
/<\/View>\n                <\/View>\n            \);\n        };/,
`</View>\n                    </View>\n                </View>\n            );\n        };`,
'9. msgBubbleWrap closed'
);

// 10. Chat header fixed for groups
patch(
`                    <View style={S.chatHeaderInfo}>
                        <Text style={S.chatHeaderName}>
                            {selectedMember?.name}
                        </Text>
                        <Text style={S.chatHeaderRole}>{roleLabel}</Text>
                    </View>
                    <View style={S.chatHeaderActions}>
                        {isAdminUser && (
                            <TouchableOpacity
                                style={[
                                    S.chatHeaderIcon,
                                    S.chatHeaderIconPrimary,
                                ]}
                                onPress={() =>
                                    openCreateTaskModal(
                                        String(selectedMember._id),
                                    )
                                }>
                                <Ionicons
                                    name="create-outline"
                                    size={22}
                                    color={T.accentDark}
                                />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={S.chatHeaderIcon}
                            onPress={() => handleInitiateCall(selectedMember)}>
                            <Ionicons
                                name="call-outline"
                                size={20}
                                color={T.ink}
                            />
                        </TouchableOpacity>
                    </View>`,
`                    <View style={S.chatHeaderInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            {selectedIsGroup ? (
                                <View style={[S.groupAvatarSm, { backgroundColor: getAvatarColor(selectedGroup?.name || "G") }]}>
                                    <Ionicons name="people" size={14} color="#fff" />
                                </View>
                            ) : null}
                            <Text style={S.chatHeaderName}>
                                {selectedIsGroup ? selectedGroup?.name : selectedMember?.name}
                            </Text>
                        </View>
                        <Text style={S.chatHeaderRole}>{roleLabel}</Text>
                    </View>
                    <View style={S.chatHeaderActions}>
                        {isAdminUser && !selectedIsGroup && (
                            <TouchableOpacity
                                style={[
                                    S.chatHeaderIcon,
                                    S.chatHeaderIconPrimary,
                                ]}
                                onPress={() =>
                                    openCreateTaskModal(
                                        String(selectedMember?._id),
                                    )
                                }>
                                <Ionicons
                                    name="create-outline"
                                    size={22}
                                    color={T.accentDark}
                                />
                            </TouchableOpacity>
                        )}
                        {!selectedIsGroup && (
                            <TouchableOpacity
                                style={S.chatHeaderIcon}
                                onPress={() => handleInitiateCall(selectedMember)}>
                                <Ionicons
                                    name="call-outline"
                                    size={20}
                                    color={T.ink}
                                />
                            </TouchableOpacity>
                        )}
                    </View>`,
'10. Chat header fixed for groups'
);

// 11. Group icon avatar added
patch(
`                <View style={S.contactAvaWrap}>
                    <InitialsAvatar name={entity?.name || "?"} size={50} />
                    <View style={S.onlineDot} />
                </View>`,
`                <View style={S.contactAvaWrap}>
                    {isGroup ? (
                        <View style={[S.groupAvatarLg, { backgroundColor: getAvatarColor(entity?.name || "G") }]}>
                            <Ionicons name="people" size={22} color="#fff" />
                        </View>
                    ) : (
                        <InitialsAvatar name={entity?.name || "?"} size={50} />
                    )}
                    {!isGroup && <View style={S.onlineDot} />}
                    {isGroup && (
                        <View style={S.groupBadge}>
                            <Ionicons name="people" size={9} color="#fff" />
                        </View>
                    )}
                </View>`,
'11. Group icon avatar added'
);

// 12. GROUP tag chip added
patch(
`                            <Text style={S.contactName} numberOfLines={1}>
                                {entity?.name}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>{!isGroup && (<>`,
`                            <Text style={S.contactName} numberOfLines={1}>
                                {entity?.name}
                            </Text>
                            {isGroup && (
                                <View style={S.groupTagChip}>
                                    <Text style={S.groupTagChipTxt}>GROUP</Text>
                                </View>
                            )}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>{!isGroup && (<>`,
'12. GROUP tag chip added'
);

// 13. Long-press delete improved
patch(
`                            "Delete Group",
                            \`Are you sure you want to delete "\${entity?.name}"?\`,`,
`                            "🗑️ Delete Group",
                            \`Delete "\${entity?.name}"? All messages will be permanently removed.\`,`,
'13a. Long-press delete title'
);
patch(
`                                            Alert.alert("Error", "Failed to delete group");`,
`                                            Alert.alert("Error", e?.response?.data?.error || "Failed to delete group");`,
'13b. Long-press delete alert'
);

// 14. Contact row roleLabel improved
patch(
`        const roleLabel = isGroup ? "Group Chat" : (isAdmin
            ? adminRoleLabelMap[String(member?._id)] || "Admin"
            : "Staff Member");`,
`        const roleLabel = isGroup
            ? \`Group · \${group?.members?.length ?? 0} members\`
            : isAdmin
                ? adminRoleLabelMap[String(member?._id)] || "Admin"
                : "Staff Member";`,
'14. Contact row roleLabel improved'
);

// 15. renderCreateGroupModal
const createGroupModalFn = `
    function renderCreateGroupModal() {
        if (!showCreateGroupModal) return null;
        return (
            <Modal
                visible={showCreateGroupModal}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => {
                    if (groupCreating) return;
                    setShowCreateGroupModal(false);
                    setGroupCreateSuccess(false);
                    setNewGroupName("");
                    setNewGroupMembers([]);
                }}>
                <View style={S.modalOverlay}>
                    <TouchableOpacity
                        style={S.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => {
                            if (groupCreating) return;
                            setShowCreateGroupModal(false);
                            setGroupCreateSuccess(false);
                            setNewGroupName("");
                            setNewGroupMembers([]);
                        }}
                    />
                    <KeyboardAvoidingView
                        style={S.modalKav}
                        behavior={Platform.OS === "ios" ? "padding" : undefined}>
                        <View style={[S.modalSheet, { paddingBottom: 30 }]}>
                            <View style={S.modalPull} />
                            {groupCreateSuccess ? (
                                <View style={S.groupSuccessWrap}>
                                    <View style={S.groupSuccessIcon}>
                                        <Ionicons name="checkmark-circle" size={64} color={T.accent} />
                                    </View>
                                    <Text style={S.groupSuccessTitle}>Group Created!</Text>
                                    <Text style={S.groupSuccessSub}>
                                        {newGroupName} has been created.\\nOpening chat now…
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <View style={[S.modalHdr, { paddingHorizontal: 20 }]}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                            <View style={S.groupModalIconWrap}>
                                                <Ionicons name="people" size={20} color={T.accentDark} />
                                            </View>
                                            <View>
                                                <Text style={S.modalTitle}>Create Group</Text>
                                                <Text style={{ fontSize: 12, color: T.mute }}>Add a name and select staff</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={S.modalClose}
                                            onPress={() => {
                                                if (groupCreating) return;
                                                setShowCreateGroupModal(false);
                                                setNewGroupName("");
                                                setNewGroupMembers([]);
                                            }}>
                                            <Ionicons name="close" size={20} color={T.ink} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={S.modalDivider} />
                                    <ScrollView
                                        contentContainerStyle={S.modalBody}
                                        keyboardShouldPersistTaps="handled"
                                        showsVerticalScrollIndicator={false}>
                                        <Text style={S.fLbl}>GROUP NAME</Text>
                                        <TextInput
                                            style={S.fInput}
                                            placeholder="e.g. Sales Team, Support Squad..."
                                            placeholderTextColor={T.mute}
                                            value={newGroupName}
                                            onChangeText={setNewGroupName}
                                            autoFocus
                                            editable={!groupCreating}
                                        />
                                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 4 }}>
                                            <Text style={S.fLbl}>SELECT STAFF</Text>
                                            <Text style={{ fontSize: 12, color: T.accent, fontWeight: "700" }}>
                                                {newGroupMembers.length} selected
                                            </Text>
                                        </View>
                                        {team.filter(m => String(m._id) !== selfId).map(member => {
                                            const isSelected = newGroupMembers.includes(String(member._id));
                                            return (
                                                <TouchableOpacity
                                                    key={String(member._id)}
                                                    style={[
                                                        S.groupMemberRow,
                                                        isSelected && S.groupMemberRowSelected,
                                                    ]}
                                                    onPress={() => {
                                                        if (groupCreating) return;
                                                        setNewGroupMembers(prev =>
                                                            isSelected
                                                                ? prev.filter(id => id !== String(member._id))
                                                                : [...prev, String(member._id)]
                                                        );
                                                    }}
                                                    activeOpacity={0.7}>
                                                    <View style={[
                                                        S.groupMemberCheck,
                                                        isSelected && S.groupMemberCheckActive,
                                                    ]}>
                                                        {isSelected && (
                                                            <Ionicons name="checkmark" size={14} color="#fff" />
                                                        )}
                                                    </View>
                                                    <InitialsAvatar name={member.name} size={38} />
                                                    <View style={{ marginLeft: 12, flex: 1 }}>
                                                        <Text style={S.groupMemberName}>{member.name}</Text>
                                                        <Text style={S.groupMemberRole}>{member.role}</Text>
                                                    </View>
                                                    {isSelected && (
                                                        <View style={S.groupMemberSelectedDot} />
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                        <TouchableOpacity
                                            style={[
                                                S.submitBtn,
                                                { marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center" },
                                                groupCreating && { opacity: 0.6 },
                                            ]}
                                            onPress={handleCreateGroup}
                                            disabled={groupCreating}>
                                            {groupCreating ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <>
                                                    <Ionicons name="people-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={S.submitBtnTxt}>Create Group</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </ScrollView>
                                </>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        );
    }
`;
patch(
    '    function renderTaskDetailFullScreen() {',
    createGroupModalFn + '    function renderTaskDetailFullScreen() {',
    '15. renderCreateGroupModal'
);

// 16. taskDetail view render
patch(
`    if (view === "taskDetail") {
        return (
            <>
                {renderTaskDetailFullScreen()}
                {renderTaskRemarkModal()}
            </>
        );
    }`,
`    if (view === "taskDetail") {
        return (
            <>
                {renderTaskDetailFullScreen()}
                {renderCreateGroupModal()}
                {renderTaskRemarkModal()}
            </>
        );
    }`,
'16. taskDetail view render'
);

// 17. Top header group button
patch(
`                <View style={S.listHeaderRight}>
                    <TouchableOpacity
                        style={[S.listHeaderIcon, { marginRight: isAdminUser ? 8 : 0 }]}
                        onPress={async () => {
                            await loadOverview({ silent: false });
                        }}
                        activeOpacity={0.85}>
                        <Ionicons
                            name="sync-outline"
                            size={18}
                            color={T.mid}
                        />
                    </TouchableOpacity>
                    {isAdminUser && (
                        <TouchableOpacity
                            style={[S.listHeaderIcon, S.listHeaderIconPrimary]}
                            onPress={() => openCreateTaskModal()}
                            activeOpacity={0.85}>
                            <Ionicons
                                name="create-outline"
                                size={20}
                                color={T.accentDark}
                            />
                        </TouchableOpacity>
                    )}
                </View>`,
`                <View style={S.listHeaderRight}>
                    <TouchableOpacity
                        style={[S.listHeaderIcon, { marginRight: 8 }]}
                        onPress={async () => {
                            await loadOverview({ silent: false });
                        }}
                        activeOpacity={0.85}>
                        <Ionicons name="sync-outline" size={18} color={T.mid} />
                    </TouchableOpacity>
                    {isAdminUser && (
                        <TouchableOpacity
                            style={[S.listHeaderIcon, S.listHeaderIconGroup]}
                            onPress={() => setShowCreateGroupModal(true)}
                            activeOpacity={0.85}>
                            <Ionicons name="people-outline" size={19} color="#7C3AED" />
                        </TouchableOpacity>
                    )}
                    {isAdminUser && (
                        <TouchableOpacity
                            style={[S.listHeaderIcon, S.listHeaderIconPrimary]}
                            onPress={() => openCreateTaskModal()}
                            activeOpacity={0.85}>
                            <Ionicons name="create-outline" size={20} color={T.accentDark} />
                        </TouchableOpacity>
                    )}
                </View>`,
'17. Top header group button'
);

// 18. Groups section added to Chats list
const oldAdmins = `                        {groupedContacts.admins.length > 0 && (
                            <>
                                {renderSectionHeader(
                                    "ADMINS",
                                    groupedContacts.admins.length,
                                )}
                                <FlatList
                                    data={groupedContacts.admins}
                                    keyExtractor={(item) =>
                                        \`admin-\${String(item.isGroup ? item.group?._id : item?.member?._id || "")}\`
                                    }
                                    renderItem={renderContactRow}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => (
                                        <View style={S.separator} />
                                    )}
                                />
                            </>
                        )}`;
const newSections = `                        {/* ── Groups Section ── */}
                        {groupedContacts.groups.length > 0 && (
                            <>
                                {renderSectionHeader("GROUPS", groupedContacts.groups.length)}
                                <FlatList
                                    data={groupedContacts.groups}
                                    keyExtractor={(item) => \`group-\${String(item.group?._id || "")}\`}
                                    renderItem={renderContactRow}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => (
                                        <View style={S.separator} />
                                    )}
                                />
                            </>
                        )}
                        {/* ── Admins Section ── */}
                        {groupedContacts.admins.length > 0 && (
                            <>
                                {renderSectionHeader(
                                    "ADMINS",
                                    groupedContacts.admins.length,
                                )}
                                <FlatList
                                    data={groupedContacts.admins}
                                    keyExtractor={(item) =>
                                        \`admin-\${String(item?.member?._id || "")}\`
                                    }
                                    renderItem={renderContactRow}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => (
                                        <View style={S.separator} />
                                    )}
                                />
                            </>
                        )}`;
patch(oldAdmins, newSections, '18. Groups section added to Chats list');

// 19. renderCreateGroupModal in main return
patch(
`            {renderTaskModal()}
            {renderTaskDetailModal()}
            {renderTaskRemarkModal()}
            <Modal statusBarTranslucent`,
`            {renderTaskModal()}
            {renderTaskDetailModal()}
            {renderCreateGroupModal()}
            {renderTaskRemarkModal()}
            <Modal statusBarTranslucent`,
'19. renderCreateGroupModal in main return'
);

// 20. Styles
patch(
`    listHeaderIconPrimary: {
        backgroundColor: T.accentSoft,
        borderColor: T.accentBorder,
    },`,
`    listHeaderIconPrimary: {
        backgroundColor: T.accentSoft,
        borderColor: T.accentBorder,
    },
    listHeaderIconGroup: {
        backgroundColor: "#F3E8FF",
        borderColor: "#D8B4FE",
        marginLeft: 8,
    },
    groupAvatarLg: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
    groupAvatarSm: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    groupBadge: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.bg },
    groupTagChip: { backgroundColor: "#F3E8FF", borderColor: "#D8B4FE", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    groupTagChipTxt: { fontSize: 9, fontWeight: "800", color: "#7C3AED", letterSpacing: 0.5 },
    msgBubbleWrap: { flex: 1, flexDirection: "column" },
    groupSenderName: { fontSize: 11, fontWeight: "700", color: T.accent, marginBottom: 2, marginLeft: 2 },
    groupModalIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accentSoft, borderWidth: 1, borderColor: T.accentBorder, alignItems: "center", justifyContent: "center" },
    groupMemberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.line },
    groupMemberRowSelected: { backgroundColor: "#F0FDF4" },
    groupMemberCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: T.line, marginRight: 12, alignItems: "center", justifyContent: "center", backgroundColor: T.bg },
    groupMemberCheckActive: { backgroundColor: T.accent, borderColor: T.accent },
    groupMemberName: { fontSize: 15, fontWeight: "600", color: T.ink },
    groupMemberRole: { fontSize: 12, color: T.mute, marginTop: 1 },
    groupMemberSelectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent, marginLeft: 8 },
    groupSuccessWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 },
    groupSuccessIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: T.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 2, borderColor: T.accentBorder },
    groupSuccessTitle: { fontSize: 22, fontWeight: "800", color: T.ink, marginBottom: 8 },
    groupSuccessSub: { fontSize: 14, color: T.mid, textAlign: "center", lineHeight: 20 },`,
'20. Styles'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('\\nDone.');
