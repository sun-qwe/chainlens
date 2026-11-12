/**
 * 页面级点击委托：data-goto / data-open-* 与抽屉内的定位动作。
 */
export function createInteractions(deps) {
  const { getChain, getDerived, actions, toast, handleExport } = deps;

  function timelineLocateNode(nodeId) {
    const chain = getChain();
    const derived = getDerived();
    const events = derived.eventsByNode.get(nodeId) || [];
    if (!events.length) {
      toast('没有事件引用该节点，无法在时间线定位', 'warn');
      return;
    }
    const sorted = events.slice().sort((a, b) => a.tsMs - b.tsMs);
    const index = chain.events.findIndex((event) => event.id === sorted[0].id);
    actions.goto('timeline', { cursor: index + 1 });
    toast(`已定位到事件 ${sorted[0].id}`, 'info');
  }

  function handleCommonClick(event) {
    const gotoBtn = event.target.closest?.('[data-goto]');
    if (gotoBtn) {
      const patch = {};
      if (gotoBtn.dataset.critical === '1') patch.critical = true;
      if (gotoBtn.dataset.focus) patch.focus = gotoBtn.dataset.focus;
      if (gotoBtn.dataset.tab) patch.tab = gotoBtn.dataset.tab;
      actions.goto(gotoBtn.dataset.goto, patch);
      return true;
    }
    const nodeBtn = event.target.closest?.('[data-open-node]');
    if (nodeBtn) {
      actions.openDrawer({ kind: 'node', id: nodeBtn.dataset.openNode });
      return true;
    }
    const eventBtn = event.target.closest?.('[data-open-event]');
    if (eventBtn) {
      actions.openDrawer({ kind: 'event', id: eventBtn.dataset.openEvent });
      return true;
    }
    const edgeBtn = event.target.closest?.('[data-open-edge]');
    if (edgeBtn) {
      actions.openDrawer({ kind: 'edge', id: edgeBtn.dataset.openEdge });
      return true;
    }
    const evidenceBtn = event.target.closest?.('[data-open-evidence]');
    if (evidenceBtn) {
      actions.openDrawer({ kind: 'evidence', id: evidenceBtn.dataset.openEvidence });
      return true;
    }
    const exportBtn = event.target.closest?.('[data-export]');
    if (exportBtn) {
      handleExport(exportBtn.dataset.export);
      return true;
    }
    return false;
  }

  return { timelineLocateNode, handleCommonClick };
}
