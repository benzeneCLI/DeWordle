import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GameTile from "../../GameTile";

describe("GameTile input logic", () => {
  it("renders a tile with the correct letter", () => {
    render(<GameTile letter="A" state="empty" />);
    expect(screen.getByText("A")).toBeDefined();
  });

  it("renders an empty tile when no letter is provided", () => {
    const { container } = render(<GameTile letter="" state="empty" />);
    const tile = container.firstChild as HTMLElement;
    expect(tile.textContent).toBe("");
  });

  it("applies correct state class for a correct letter", () => {
    const { container } = render(<GameTile letter="B" state="correct" />);
    const tile = container.firstChild as HTMLElement;
    expect(tile.className).toMatch(/correct/);
  });

  it("applies correct state class for a present letter", () => {
    const { container } = render(<GameTile letter="C" state="present" />);
    const tile = container.firstChild as HTMLElement;
    expect(tile.className).toMatch(/present/);
  });

  it("applies correct state class for an absent letter", () => {
    const { container } = render(<GameTile letter="D" state="absent" />);
    const tile = container.firstChild as HTMLElement;
    expect(tile.className).toMatch(/absent/);
  });
});