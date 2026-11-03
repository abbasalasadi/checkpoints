use std::fmt;

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
}

impl fmt::Display for Table {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        if self.headers.is_empty() {
            return Ok(());
        }

        let mut widths: Vec<usize> = self.headers.iter().map(|h| h.len()).collect();

        for row in &self.body {
            for (i, cell) in row.iter().enumerate() {
                widths[i] = widths[i].max(cell.len());
            }
        }

        write_row(f, &self.headers, &widths)?;
        writeln!(f)?;
        write_separator(f, &widths)?;
        writeln!(f)?;

        for row in &self.body {
            write_row(f, row, &widths)?;
            writeln!(f)?;
        }

        Ok(())
    }
}

fn write_row(f: &mut fmt::Formatter, row: &[String], widths: &[usize]) -> fmt::Result {
    write!(f, "|")?;

    for (cell, width) in row.iter().zip(widths.iter()) {
        let extra = width - cell.len();
        let left = extra / 2;
        let right = extra - left;

        write!(f, " {}{}{} |", " ".repeat(left), cell, " ".repeat(right))?;
    }

    Ok(())
}

fn write_separator(f: &mut fmt::Formatter, widths: &[usize]) -> fmt::Result {
    write!(f, "|")?;

    for (i, width) in widths.iter().enumerate() {
        write!(f, "{}", "-".repeat(width + 2))?;

        if i + 1 == widths.len() {
            write!(f, "|")?;
        } else {
            write!(f, "+")?;
        }
    }

    Ok(())
}
