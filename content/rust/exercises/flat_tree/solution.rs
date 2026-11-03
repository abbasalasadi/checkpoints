use std::collections::BTreeSet;

pub fn flatten_tree<T: ToOwned<Owned = T>>(tree: &BTreeSet<T>) -> Vec<T> {
    tree.iter().map(|x| x.to_owned()).collect()
}
