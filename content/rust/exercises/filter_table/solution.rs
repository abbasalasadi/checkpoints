#[derive(Clone, Debug, PartialEq)]
pub struct Table {
    pub headers: Vec<String>,
    pub body: Vec<Vec<String>>,
}

impl Table {
    pub fn new() -> Table {
        Table {
            headers: Vec::new(),
            body: Vec::new(),
        }
    }

    pub fn add_row(&mut self, row: &[String]) {
        self.body.push(row.to_vec());
    }

    pub fn filter_col<F>(&self, filter: F) -> Option<Self>
    where
        F: Fn(&str) -> bool,
    {
        let indexes: Vec<usize> = self
            .headers
            .iter()
            .enumerate()
            .filter(|(_, header)| filter(header))
            .map(|(i, _)| i)
            .collect();

        if indexes.is_empty() {
            return None;
        }

        Some(Table {
            headers: indexes.iter().map(|&i| self.headers[i].clone()).collect(),
            body: self
                .body
                .iter()
                .map(|row| indexes.iter().map(|&i| row[i].clone()).collect())
                .collect(),
        })
    }

    pub fn filter_row<F>(&self, col_name: &str, filter: F) -> Option<Self>
    where
        F: Fn(&str) -> bool,
    {
        let col_index = self.headers.iter().position(|h| h == col_name)?;

        let body: Vec<Vec<String>> = self
            .body
            .iter()
            .filter(|row| filter(&row[col_index]))
            .cloned()
            .collect();

        if body.is_empty() {
            return None;
        }

        Some(Table {
            headers: self.headers.clone(),
            body,
        })
    }
}
