import React from 'react';

export interface RunTreeNode {
  id: string;
  name: string;
  role: string;
  children?: RunTreeNode[];
}

interface RunTreeProps {
  nodes: RunTreeNode[];
  selectedActorId: string | null;
}

const TreeBranch = ({ node, selectedActorId, depth }: { node: RunTreeNode; selectedActorId: string | null; depth: number }) => {
  const isSelected = node.id === selectedActorId;

  return (
    <li role="treeitem" aria-selected={isSelected} aria-level={depth + 1}>
      <div className={`run-tree-item${isSelected ? ' is-selected' : ''}`} style={{ paddingLeft: `${depth * 14}px` }}>
        <span>{node.name}</span>
        <span className="run-tree-role">{node.role}</span>
      </div>
      {node.children?.length ? (
        <ul className="run-tree-list" role="group">
          {node.children.map((child) => (
            <TreeBranch key={child.id} node={child} selectedActorId={selectedActorId} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const RunTree = ({ nodes, selectedActorId }: RunTreeProps) => {
  return (
    <section className="pixel-panel board-panel">
      <div className="panel-section">
        <h2 className="panel-title">RUN TREE</h2>
        <ul className="run-tree-list" role="tree" aria-label="Run tree">
          {nodes.map((node) => (
            <TreeBranch key={node.id} node={node} selectedActorId={selectedActorId} depth={0} />
          ))}
        </ul>
      </div>
    </section>
  );
};
