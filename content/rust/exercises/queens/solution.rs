#[derive(Debug, Clone, Copy)]
pub struct ChessPosition {
    pub rank: usize,
    pub file: usize,
}

impl ChessPosition {
    pub fn new(rank: usize, file: usize) -> Option<Self> {
        if rank < 8 && file < 8 {
            Some(Self { rank, file })
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Queen {
    pub position: ChessPosition,
}

impl Queen {
    pub fn new(position: ChessPosition) -> Self {
        Self { position }
    }

    pub fn can_attack(self, other: Self) -> bool {
        let same_rank = self.position.rank == other.position.rank;
        let same_file = self.position.file == other.position.file;

        let rank_diff = self.position.rank.abs_diff(other.position.rank);
        let file_diff = self.position.file.abs_diff(other.position.file);

        same_rank || same_file || rank_diff == file_diff
    }
}
