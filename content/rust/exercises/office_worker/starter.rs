#[derive(Debug, PartialEq, Eq)]
pub struct OfficeWorker {
}

#[derive(Debug, PartialEq, Eq)]
pub enum WorkerRole {
}

impl From<&str> for OfficeWorker {
    fn from(s: &str) -> Self {
        todo!()
    }
}

impl From<&str> for WorkerRole {
    fn from(s: &str) -> Self {
        todo!()
    }
}
