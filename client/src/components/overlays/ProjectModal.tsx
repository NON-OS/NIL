import { useState } from 'react';
import Modal from '../ui/Modal';
import ColorSwatches from '../ui/ColorSwatches';
import ConfirmButton from '../ui/ConfirmButton';
import AssigneePicker from '../pickers/AssigneePicker';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import projectActions from '../../actions/projects';
import router from '../../lib/router';
import meta from '../../lib/meta';
import type Project from '../../types/Project';
import isAdminUser from '../../lib/isAdmin';

interface Props {
  project?: Project;
  onClose: () => void;
}

export default function ProjectModal({ project, onClose }: Props) {
  const users = useStore((s) => s.users);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [name, setName] = useState(project?.name ?? '');
  const [key, setKey] = useState(project?.key ?? '');
  const [color, setColor] = useState(project?.color ?? meta.palette[0].value);
  const [description, setDescription] = useState(project?.description ?? '');
  const [leadId, setLeadId] = useState<string | null>(project?.leadId ?? null);
  const [saving, setSaving] = useState(false);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const input = { name, key, color, description, leadId };
    const result = project ? await projectActions.update(project.id, input) : await projectActions.create(input);
    setSaving(false);
    if (!result) return;
    onClose();
    if (!project) router.navigate(`/projects/${result.id}`);
  };

  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      width={520}
      footer={
        <>
          {project && (
            <span style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={() => projectActions.update(project.id, { archived: !project.archived }).then(onClose)}>
                {project.archived ? 'Unarchive' : 'Archive'}
              </button>
              {isAdmin && (
                <ConfirmButton onConfirm={() => projectActions.remove(project.id).then((ok) => ok && (onClose(), router.navigate('/')))}>Delete</ConfirmButton>
              )}
            </span>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={!name.trim() || saving}>
            {project ? 'Save' : 'Create project'}
          </button>
        </>
      }
    >
      <form className="modal-body" style={{ display: 'grid', gap: 14 }} onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
          <label className="field">
            <span>Name</span>
            <input className="input" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website relaunch" />
          </label>
          <label className="field">
            <span>Key</span>
            <input className="input mono" value={key} maxLength={6} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Auto" />
          </label>
        </div>
        <div className="field">
          <span>Color</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <label className="field">
          <span>What is this project for?</span>
          <textarea className="textarea" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="The outcome, in a sentence or two." />
        </label>
        <div className="field">
          <span>Lead</span>
          <div>
            <AssigneePicker value={leadId} onChange={setLeadId} className="btn" excludeAgents>
              <Avatar user={leadId ? users[leadId] : null} size={18} />
              {leadId ? users[leadId]?.name : 'No lead'}
            </AssigneePicker>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
