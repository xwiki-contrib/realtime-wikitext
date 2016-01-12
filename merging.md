# Merge Cases

I will use several short forms to refer to documents in the realtime collaborative editor, and the wysiwyg editor's versions as they compare to the realtime collaborative document's history:

When a realtime client joins or creates a realtime session, its page contains an attribute specifying the most recently saved version. This version will be referred to as **O**.

When a realtime or non-realtime client saves, the latest saved version is referred to as **A**.

The most recent version of the realtime client is referred to as **B**.

We need these terms because if a state is committed to the wiki history without informing any concurrent realtime clients, the document histories can diverge, and the differing types of sessions can end up overwriting each other's history.

Due to the difficulty of extending the XWiki core to tolerate such divergences, the logic of choosing when to merge was implemented in the realtime client.

Rather than simply saving while in a realtime session, the client first posts the contents of its document (B) to the server, which will determine to the best of its knowledge whether a three way merge is necessary.

There are two cases where pairs of O, A, and B can be identical:

* If O and A contain the same content, then either there have not been any changes saved outside of the realtime session, or there were, but the changes were identical. In such a case, no three way merge is required. The server will inform the client of this, and then the client will save.
* If A and B contain the same content, then there have been multiple save since O was updated on the clients, but they have not resulted in any differences. Again, no merge is necessary.

It is possible that the server will perform a merge without the merge being required. Only the client can know whether this is the case. For this reason, when the merge is performed, the server returns not only the merged content, but also the content of A. This is necessary because the client only has knowledge of O and B.

When all this information is returned to the client, it then has to decide what to do with it.

1. the server returns a _merged_ field. If this is false, then the client can simply save. If it is true, it must continue to perform checks.
2. the client is able to check whether a given state (the content of A) ever existed in its history. If a merge was performed, then we know A and B differed, and as such, if A exists in history then it is an older version. In such a case, the client will ignore the merge, as it would contain undesired reversions.
3. the server also returns a _saveRequired_ field which tells the client whether it should try to save. This is the case where there was a merge, or where there was not, but A and B are not equal.
4. all of these actions are asynchronous, and there is the possibility that while the client was waiting for the server's response, more changes were made. If this is the case, the changes will be detected, and the merge will not be forced back into the editor content area.

After having determined that the merge should take place, the client is then responsible for saving. They will do so, then ask the server for the newest version stamp, remember that version locally, and then send an ISAVED message to the other clients, informing them that they have updated the latest document. This message will contain the version string, and the other clients are expected to update their local definition of O. This update concerns the lastSaved.content (which is determined from the current contents of the textarea), and the lastSaved.version (from the contents ofthe message). When clients receive an ISAVED message, the set a flag such that any concurrent processes which may be attempting to save are cancelled. Before any new processes begin, the flag is reset to false.

## Other scenarious you may encounter

1. When the server returns a merge and A, your client will check whether A exists in its history. The comparison is exact, and as such, if there are any differences at all, the content will be merged. In practice, you may find that this reintroduces words that were removed. The merge algorithm is not currently smart enough to determine what you meant, it only sees differences and attempts to reconcile them.
2. If a user is in a realtime session with at least one other client, and they click the preview button, they exit the realtime session. If they save from there, the save is equivalent to if they had been in a non-realtime session. When the other client merges, these changes should be ignored, as they are guaranteed to exist in the history. This is reasonable behaviour.
3. If a user is alone in a realtime session, and they use the preview mode, the realtime session will end. If somebody else creates a new realtime session before they are able to save, they will not have the history. After the preview mode saves, when the realtime client checks for changes a merge will occur, and possibly revert. This is also considered reasonable behaviour, but you may find that not using preview mode will produce more reliable results. Save and View should be preferred.
