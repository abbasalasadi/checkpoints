use std::fmt;

pub struct Park {
    pub name: Option<String>,
    pub park_type: ParkType,
    pub address: Option<String>,
    pub cap: Option<String>,
    pub state: Option<String>,
}

pub enum ParkType {
    Garden,
    Forest,
    Playground,
}

impl fmt::Display for Park {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} - {}, {}, {} - {}",
            self.park_type,
            self.name.as_deref().unwrap_or("No name"),
            self.address.as_deref().unwrap_or("No address"),
            self.cap.as_deref().unwrap_or("No cap"),
            self.state.as_deref().unwrap_or("No state")
        )
    }
}

impl fmt::Display for ParkType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let park_type = match self {
            ParkType::Garden => "garden",
            ParkType::Forest => "forest",
            ParkType::Playground => "playground",
        };

        write!(f, "{}", park_type)
    }
}
