import { MongoClient, ObjectId } from "mongodb";
import { ContactModel, EquipoModel } from "./types.ts";
import { fromModelToContact, fromModelToEquipo } from "./utils.ts";

const MONGO_URL = Deno.env.get("MONGO_URL");
if (!MONGO_URL) {
  console.error("Please provide a MONGO_URL");
}

const client = new MongoClient(MONGO_URL);
await client.connect();
console.info("Connected to MongoDB");

const db = client.db("SimulacroApiRest1DB");
const ContactsCollection = db.collection<ContactModel>("contactos");
const EquiposCollection = db.collection<EquipoModel>("equipos");

const handler = async (req: Request): Promise<Response> => {
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;

  if (method === "GET") {
    if (path === "/contacts") {
      const name = url.searchParams.get("name");
      if (name) {
        const contactsDB = await ContactsCollection.find({ name }).toArray();
        const contacts = await Promise.all(
          contactsDB.map((c) => fromModelToContact(c, EquiposCollection)),
        );
        return new Response(JSON.stringify(contacts));
      } else {
        const contactsDB = await ContactsCollection.find().toArray();
        const contacts = await Promise.all(
          contactsDB.map((c) => fromModelToContact(c, EquiposCollection)),
        );
        return new Response(JSON.stringify(contacts));
      }
    } else if (path === "/equipos") {
      const equiposDB = await EquiposCollection.find().toArray();
      const equipos = await equiposDB.map((e) => fromModelToEquipo(e));
      return new Response(JSON.stringify(equipos));
    } else if (path === "/equipo") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Bad request", { status: 400 });
      const equipoDB = await EquiposCollection.findOne(
        { _id: new ObjectId(id) },
      );
      if (!equipoDB) return new Response("Equipo not found", { status: 404 });
      const equipo = fromModelToEquipo(equipoDB);
      return new Response(JSON.stringify(equipo));
    }
  } else if (method === "POST") {
    if (path === "/contact") {
      const contact = await req.json();
      if (!contact.name || !contact.phone) {
        return new Response("Bad request", { status: 404 });
      }

      const existeContact = await ContactsCollection.findOne({
        phone: contact.phone,
      });
      if (existeContact) return new Response("Contact exists");

      const { insertedId } = await ContactsCollection.insertOne({
        name: contact.name,
        phone: contact.phone,
        equipos: contact.equipos.map((id: string) => new ObjectId(id)),
      });

      return new Response(
        JSON.stringify({
          id: insertedId,
          name: contact.name,
          phone: contact.phone,
          time: contact.time,
          equipos: contact.equipos.map((id: string) => new ObjectId(id)),
        }),
        { status: 200 },
      );
    } else if (path === "/equipo") {
      const equipo = await req.json();
      if (!equipo.name) {
        return new Response("Bad request", { status: 404 });
      }

      const { insertedId } = await EquiposCollection.insertOne({
        name: equipo.name,
      });

      return new Response(
        JSON.stringify({
          id: insertedId,
          name: equipo.name,
        }),
        { status: 200 },
      );
    }
  } else if (method === "PUT") {
    if (path === "/contact") {
      const contact = await req.json();
      if (!contact.name || !contact.phone || !contact.equipos) {
        return new Response("Bad request", { status: 404 });
      }

      if (contact.equipos) {
        const equipos = await EquiposCollection.find(
          {
            _id: { $in: contact.equipos.map((id: string) => new ObjectId(id)) },
          },
        ).toArray();

        if (equipos.length !== contact.equipos.length) {
          return new Response("No existe el equipo", { status: 404 });
        }
      }

      const { modifiedCount } = await ContactsCollection.updateOne(
        { phone: contact.phone },
        {
          $set: {
            name: contact.name,
            phone: contact.phone,
            equipos: contact.equipos,
          },
        },
      );

      if (modifiedCount === 0) {
        return new Response("Contact not found", { status: 404 });
      }
      return new Response("OK", { status: 200 });
    } else if (path === "/equipo") {
      const equipo = await req.json();
      if (!equipo.name) {
        return new Response("Bad request", { status: 400 });
      }

      const { modifiedCount } = await EquiposCollection.updateOne(
        { _id: new ObjectId(equipo.id as string) },
        { $set: { name: equipo.name } },
      );
      if (modifiedCount === 0) {
        return new Response("Equipo not found", { status: 400 });
      }
      return new Response("OK", { status: 200 });
    }
  } else if (method === "DELETE") {
    if (path === "/contact") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Bad request", { status: 404 });

      const { deletedCount } = await ContactsCollection.deleteOne(
        { _id: new ObjectId(id) },
      );

      if (deletedCount === 0) {
        return new Response("Contact not found", { status: 404 });
      }
      return new Response("OK", { status: 200 });
    } else if (path === "/equipo") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Bad request", { status: 400 });

      const { deletedCount } = await EquiposCollection.deleteOne(
        { _id: new ObjectId(id) },
      );

      await ContactsCollection.updateMany(
        { equipos: new ObjectId(id) },
        { $pull: { equipos: new ObjectId(id) } },
      );

      if (deletedCount === 0) {
        return new Response("Equipo not found", { status: 404 });
      }
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Endpoint not found");
};

Deno.serve({ port: 3000 }, handler);
