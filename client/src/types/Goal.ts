import type GoalStatus from './GoalStatus';

export default interface Goal {
  id: string;
  title: string;
  description: string;
  ownerId: string | null;
  status: GoalStatus;
  targetDate: string | null;
  metricName: string;
  metricStart: number | null;
  metricCurrent: number | null;
  metricTarget: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}
