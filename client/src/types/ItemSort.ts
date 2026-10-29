// How a folder's contents are ordered: by name, last change, size or type, either way round.
export default interface ItemSort {
  by: 'name' | 'updated' | 'size' | 'type';
  desc: boolean;
}
