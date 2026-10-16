import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import type Project from '../types/Project';

const put = (project: Project) => store.set((s) => ({ projects: records.put(s.projects, project) }));

const projects = {
  async create(input: Partial<Project>) {
    try {
      const { project } = await http.post<{ project: Project }>('/projects', input);
      put(project);
      return project;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },

  async update(id: string, patch: Partial<Project>) {
    try {
      const { project } = await http.patch<{ project: Project }>(`/projects/${id}`, patch);
      put(project);
      return project;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },

  async remove(id: string) {
    try {
      await http.del(`/projects/${id}`);
      store.set((s) => ({ projects: records.drop(s.projects, id) }));
      toast.show('Project deleted. Its tasks are now under No project.');
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  },
};

export default projects;
