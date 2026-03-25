import type { StateInterface } from "../interfaces/StateInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { StateCollectionInterface } from "../interfaces/StateCollectionInterface.js";
import type { Named } from "../interfaces/Named.js";

export interface GraphNode {
  id: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function isNamed(obj: unknown): obj is Named {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getName" in obj &&
    typeof (obj as Named).getName === "function"
  );
}

function escapeDoubleQuotes(str: string): string {
  return str.replace(/"/g, '\\"');
}

function toMermaidId(name: string): string {
  return (
    "s_" +
    name.replace(
      /[^a-zA-Z0-9]/g,
      (ch) => `_${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
    )
  );
}

function escapeMermaidLabel(str: string): string {
  return str.replace(/"/g, "#quot;");
}

function convertToString(obj: unknown): string {
  if (isNamed(obj)) {
    return obj.getName();
  }
  return String(obj);
}

export interface DotOptions {
  rankdir?: string;
}

export interface MermaidOptions {
  direction?: string;
}

export class GraphBuilder {
  private readonly nodes: Map<string, GraphNode> = new Map();
  private readonly edges: GraphEdge[] = [];

  private getOrCreateNode(state: StateInterface): GraphNode {
    const name = state.getName();
    let node = this.nodes.get(name);
    if (!node) {
      node = { id: name, label: name, metadata: state.getMetadata() };
      this.nodes.set(name, node);
    }
    return node;
  }

  protected getTransitionLabel(
    state: StateInterface,
    transition: TransitionInterface,
  ): string {
    const parts: string[] = [];
    const eventName = transition.getEventName();
    if (eventName) {
      parts.push(`E: ${eventName}`);
      const event = state.getEvent(eventName);
      const observerNames: string[] = [];
      for (const observer of event.getObservers()) {
        observerNames.push(convertToString(observer));
      }
      if (observerNames.length > 0) {
        parts.push(`C: ${observerNames.join(", ")}`);
      }
    }
    const conditionName = transition.getConditionName();
    if (conditionName) {
      parts.push(`IF: ${conditionName}`);
    }
    parts.push(`W: ${transition.getWeight()}`);
    return parts.join("\n");
  }

  addState(state: StateInterface): void {
    this.getOrCreateNode(state);
    for (const transition of state.getTransitions()) {
      const sourceNode = this.getOrCreateNode(state);
      const targetNode = this.getOrCreateNode(transition.getTargetState());
      const label = this.getTransitionLabel(state, transition);
      const metadata: Record<string, unknown> = {};
      const eventName = transition.getEventName();
      if (eventName && state.hasEvent(eventName)) {
        Object.assign(metadata, state.getEvent(eventName).getMetadata());
      }
      this.edges.push({
        source: sourceNode.id,
        target: targetNode.id,
        label,
        metadata,
      });
    }
  }

  addStates(states: Iterable<StateInterface>): void {
    for (const state of states) {
      this.addState(state);
    }
  }

  addStateCollection(stateCollection: StateCollectionInterface): void {
    this.addStates(stateCollection.getStates());
  }

  getGraph(): Graph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    };
  }

  toDot(options?: DotOptions): string {
    const graph = this.getGraph();
    const rankdir = options?.rankdir ?? "LR";
    const lines: string[] = [];
    lines.push("digraph {");
    lines.push(`  rankdir=${rankdir};`);
    for (const node of graph.nodes) {
      const label = escapeDoubleQuotes(node.label);
      lines.push(`  "${label}" [label="${label}"];`);
    }
    for (const edge of graph.edges) {
      const source = escapeDoubleQuotes(edge.source);
      const target = escapeDoubleQuotes(edge.target);
      const label = escapeDoubleQuotes(edge.label);
      lines.push(`  "${source}" -> "${target}" [label="${label}"];`);
    }
    lines.push("}");
    return lines.join("\n");
  }

  toMermaid(options?: MermaidOptions): string {
    const graph = this.getGraph();
    const direction = options?.direction ?? "LR";
    const lines: string[] = [];
    lines.push(`stateDiagram-v2`);
    lines.push(`  direction ${direction}`);
    const declared = new Set<string>();
    for (const node of graph.nodes) {
      const id = toMermaidId(node.id);
      if (!declared.has(id)) {
        declared.add(id);
        const label = escapeMermaidLabel(node.label);
        lines.push(`  ${id} : "${label}"`);
      }
    }
    for (const edge of graph.edges) {
      const source = toMermaidId(edge.source);
      const target = toMermaidId(edge.target);
      const label = escapeMermaidLabel(edge.label.replace(/\n/g, " / "));
      lines.push(`  ${source} --> ${target} : ${label}`);
    }
    return lines.join("\n");
  }
}
