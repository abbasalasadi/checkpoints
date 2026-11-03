use std::ops::Add;

#[derive(Debug, PartialEq, Eq)]
pub struct Garage<T> {
    pub left: Option<T>,
    pub right: Option<T>,
}

impl<T> Garage<T>
where
    T: Add<Output = T> + Copy,
{
    pub fn move_to_right(&mut self) {
        match (self.left, self.right) {
            (Some(l), Some(r)) => {
                self.right = Some(l + r);
                self.left = None;
            }
            (Some(l), None) => {
                self.right = Some(l);
                self.left = None;
            }
            _ => {}
        }
    }

    pub fn move_to_left(&mut self) {
        match (self.left, self.right) {
            (Some(l), Some(r)) => {
                self.left = Some(l + r);
                self.right = None;
            }
            (None, Some(r)) => {
                self.left = Some(r);
                self.right = None;
            }
            _ => {}
        }
    }
}
