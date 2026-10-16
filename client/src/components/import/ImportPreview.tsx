import useStore from '../../state/useStore';
import meta from '../../lib/meta';
import dates from '../../lib/dates';
import type ImportPlan from '../../types/ImportPlan';

const SHOWN = 8;

// The first few tasks as they'll arrive, with people and projects already matched.
export default function ImportPreview({ plan }: { plan: ImportPlan }) {
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const projectName = (name: string | null) => {
    const target = name ? plan.projects[name] : null;
    if (!target) return '';
    return 'id' in target ? projects[target.id]?.name ?? '' : `${name} (new)`;
  };
  const personName = (name: string | null) => {
    const id = name ? plan.people[name] : null;
    return id ? users[id]?.name ?? '' : '';
  };

  return (
    <div className="import-preview">
      <table>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Project</th>
            <th scope="col">Assignee</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {plan.items.slice(0, SHOWN).map((item, i) => (
            <tr key={i}>
              <td>{item.title}</td>
              <td>{projectName(item.project)}</td>
              <td>{personName(item.person)}</td>
              <td className="num">{item.dueDate ? dates.short(item.dueDate) : ''}</td>
              <td>{meta.status[item.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.items.length > SHOWN && <p className="muted">And {plan.items.length - SHOWN} more.</p>}
    </div>
  );
}
