use std::fmt;

#[derive(Debug, Clone)]
pub struct Matrix(pub Vec<Vec<i32>>);

impl Matrix {
    pub fn new(slice: &[&[i32]]) -> Self {
        Matrix(slice.iter().map(|row| row.to_vec()).collect())
    }
}

impl fmt::Display for Matrix {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, row) in self.0.iter().enumerate() {
            if i > 0 {
                write!(f, "\n")?;
            }

            write!(
                f,
                "({})",
                row.iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(" ")
            )?;
        }

        Ok(())
    }
}
