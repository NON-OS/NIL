import type Task from '../types/Task';

// A card says nothing about a task's notes and checklist. When it's the very version this tab
// already holds whole, they carry over, so a refresh never takes away what's on screen.
export default function keepWords(held: Task | undefined, card: Task): Task {
  if (!held || card.description !== undefined || held.description === undefined) return card;
  if (held.updatedAt !== card.updatedAt || held.sealed?.title !== card.sealed?.title) return card;
  return { ...card, description: held.description, checklist: held.checklist, steps: held.steps, sealed: held.sealed };
}
