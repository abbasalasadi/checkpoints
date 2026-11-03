#[derive(Debug, Clone, Copy)]
pub struct ChessPosition {
    pub rank: usize,
    pub file: usize,
}

impl ChessPosition {
    pub fn new(rank: usize, file: usize) -> Option<Self> {
        todo!()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Queen {
    pub position: ChessPosition,
}

impl Queen {
    pub fn new(position: ChessPosition) -> Self {
        todo!()
    }

    pub fn can_attack(self, other: Self) -> bool {
        todo!()
    }
}
