pub mod library {
    pub mod books {
        pub struct Book {
            pub title: String,
            pub year: u32,
        }
    }

    pub mod writers {
        use super::books::Book;

        pub struct Writer {
            pub first_name: String,
            pub last_name: String,
            pub books: Vec<Book>,
        }
    }
}

use library::writers::Writer;

pub fn order_books(writer: &mut Writer) {
    writer
        .books
        .sort_by_key(|book| book.title.to_lowercase());
}
